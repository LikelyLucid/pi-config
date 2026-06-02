import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * DeepSeek Tool Call Sanitizer Extension
 *
 * Problem: DeepSeek models sometimes hallucinate malformed XML-style tool
 * calls as plain text at the end of an assistant response, e.g.:
 *
 *   <pi_tool_calls>
 *    <piinvoke name="bash">
 *      <piparameter name="command" string="true">some command</piparameter>
 *    </piinvoke>
 *   </pi_tool_calls>
 *
 * These are not valid structured tool calls — they are hallucinated text
 * that either errors out or shows as broken markup. This extension:
 *
 * 1. Strips the malformed block from the persisted message
 * 2. Sends a follow-up user message asking the model to continue generating
 *    a proper response, so the turn doesn't just end with stripped garbage
 *
 * It only attempts one continuation per turn to avoid infinite loops.
 *
 * Usage:
 *   /deepseek-sanitizer        - Toggle on/off
 *   /deepseek-sanitizer on     - Enable
 *   /deepseek-sanitizer off    - Disable
 */

export default function (pi: ExtensionAPI) {
  let enabled = true;

  // Track whether we already sent a continuation prompt this turn to avoid loops
  // WeakMap keyed on message id so it auto-clears
  const continuationSent = new WeakMap<object, boolean>();

  // Build the tag name dynamically to avoid false-positive tool call parsing
  // during extension development.
  const tagName = "pi" + "_" + "tool_calls";

  // Escape special regex chars, then build the pattern:
  // matches <tagName>...</tagName> at end of string (with optional trailing ws)
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const malformedBlockRegex = new RegExp(
    `<${escapedTag}>[\\s\\S]*?<\\/${escapedTag}>\\s*$`
  );

  pi.on("message_end", async (event, _ctx) => {
    if (!enabled) return;

    // Only process assistant messages
    if (event.message.role !== "assistant") return;

    const msg = event.message;
    const content = msg.content;
    if (!content || !Array.isArray(content)) return;
    if (content.length === 0) return;

    // Find the last text content block
    const lastIdx = content.length - 1;
    const lastBlock = content[lastIdx];
    if (!lastBlock || lastBlock.type !== "text") return;

    const text = lastBlock.text;
    if (!text) return;

    // Check if the last text block ends with the malformed tool call pattern
    if (!malformedBlockRegex.test(text)) return;

    // Strip the malformed pattern
    const cleaned = text.replace(malformedBlockRegex, "").trimEnd();

    // Build the replacement message content
    let newContent: typeof content;
    if (!cleaned) {
      // Entire block was the malformed call — remove it entirely
      newContent = content.slice(0, lastIdx);
    } else {
      // Replace the text with the cleaned version
      newContent = [
        ...content.slice(0, lastIdx),
        { ...lastBlock, text: cleaned },
      ] as typeof content;
    }

    // Send a continuation prompt so the model doesn't just end after garbage.
    // Use a WeakMap keyed on the message object to prevent re-triggering if
    // the follow-up response itself also ends with garbage (limit 1 retry).
    if (!continuationSent.has(msg)) {
      continuationSent.set(msg, true);
      pi.sendUserMessage(
        "[Malformed tool call block removed. Continue your response naturally from where you left off.]",
        { deliverAs: "followUp" }
      );
    }

    // Return the cleaned message for storage/display
    return {
      message: {
        ...msg,
        content: newContent,
      },
    };
  });

  // Register toggle command
  pi.registerCommand("deepseek-sanitizer", {
    description: "Toggle malformed tool call sanitizer",
    handler: async (args: string, ctx) => {
      if (args === "on") {
        enabled = true;
      } else if (args === "off") {
        enabled = false;
      } else {
        enabled = !enabled;
      }
      ctx.ui.notify(
        `🔧 deepseek-sanitizer ${enabled ? "enabled" : "disabled"}`,
        enabled ? "info" : "warning"
      );
    },
  });
}
