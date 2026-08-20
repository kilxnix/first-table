import { useCallback, useMemo, useRef } from "react";
import { FlatList, ListRenderItemInfo, StyleSheet, View } from "react-native";
import { PartyMember, ThreadMessage } from "../types";
import { MessageBubble } from "./MessageBubble";
import { TypingRow } from "./TypingRow";

interface Props {
  thread: ThreadMessage[];
  typing: Record<string, string>; // seat -> display name
  party: PartyMember[];
}

export function ChatThread({ thread, typing, party }: Props) {
  const listRef = useRef<FlatList<ThreadMessage>>(null);

  const portraits = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of party) map[p.seat] = p.portrait;
    return map;
  }, [party]);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ThreadMessage>) => {
      const prev = index > 0 ? thread[index - 1] : undefined;
      const grouped =
        !!prev && item.kind === "agent" && prev.kind === "agent" && !!item.seat && prev.seat === item.seat;
      return (
        <MessageBubble
          message={item}
          portrait={item.seat ? portraits[item.seat] : undefined}
          grouped={grouped}
        />
      );
    },
    [thread, portraits]
  );

  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.content}
      data={thread}
      keyExtractor={(m) => String(m.id)}
      renderItem={renderItem}
      onContentSizeChange={scrollToEnd}
      showsVerticalScrollIndicator={false}
      ListFooterComponent={
        <View style={styles.footer}>
          {Object.entries(typing).map(([seat, name]) => (
            <TypingRow key={seat} name={name} />
          ))}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  footer: { paddingBottom: 4 },
});
