import { useCallback, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PartyMember, ThreadMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { TypingRow } from "./TypingRow";

interface Props {
  thread: ThreadMessage[];
  typing: Record<string, string>; // seat -> display name
  party: PartyMember[];
}

// Rendered as the DOM id by react-native-web; harmless on native.
const SCROLL_NODE_ID = "chat-thread-scroll";

// Deliberately a ScrollView, not a FlatList: threads are scene-length (bounded),
// and react-native-web's VirtualizedList neither extends its render window nor
// honors scrollToEnd here, which silently hides new messages.
export function ChatThread({ thread, typing, party }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const portraits = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of party) map[p.seat] = p.portrait;
    return map;
  }, [party]);

  const scrollToEnd = useCallback(() => {
    // setTimeout, not requestAnimationFrame: rAF callbacks freeze entirely in
    // hidden/non-compositing tabs, leaving the thread pinned to the top.
    setTimeout(() => {
      // Web first: the RN ref's scrollToEnd/getScrollableNode are unreliable on
      // react-native-web (observed throwing / no-op), so pin the DOM node by id.
      if (typeof document !== "undefined") {
        const node = document.getElementById(SCROLL_NODE_ID);
        if (node) {
          node.scrollTop = node.scrollHeight;
          return;
        }
      }
      try {
        scrollRef.current?.scrollToEnd({ animated: false });
      } catch {
        // never let auto-scroll take down the thread
      }
    }, 0);
  }, []);

  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    scrollToEnd();
  }, [thread.length, typingCount, scrollToEnd]);

  return (
    <ScrollView
      ref={scrollRef}
      nativeID={SCROLL_NODE_ID}
      style={styles.list}
      contentContainerStyle={[
        styles.content,
        // Landscape notch: keep bubbles out of the cut-out on both edges.
        { paddingLeft: 14 + insets.left, paddingRight: 14 + insets.right },
      ]}
      onContentSizeChange={scrollToEnd}
      showsVerticalScrollIndicator={false}
    >
      {thread.map((item, index) => {
        const prev = index > 0 ? thread[index - 1] : undefined;
        const grouped =
          !!prev && item.kind === "agent" && prev.kind === "agent" && !!item.seat && prev.seat === item.seat;
        return (
          <MessageBubble
            key={item.id}
            message={item}
            portrait={item.seat ? portraits[item.seat] : undefined}
            grouped={grouped}
          />
        );
      })}
      <View style={styles.footer}>
        {Object.entries(typing).map(([seat, name]) => (
          <TypingRow key={seat} name={name} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Transparent on purpose: the MoodCanvas gradient breathes through the thread.
  // width/alignSelf pin the list to the screen so no bubble can widen the page.
  list: { flex: 1, width: "100%", alignSelf: "stretch", backgroundColor: "transparent" },
  // Horizontal padding is applied inline so safe-area insets fold in.
  content: { paddingTop: 12, paddingBottom: 16 },
  footer: { paddingBottom: 6, maxWidth: "100%" },
});
