import AsyncStorage from "@react-native-async-storage/async-storage";
export type ChatStyleId = "chat-classic" | "chat-floodlight" | "chat-derby" | "chat-neon";
export const CHAT_STYLE_KEY = "@football-link/chat-style";
export const chatStyleItems = [
  { item_id: "chat-classic", name: "Klasik Tribün", kind: "CHAT_STYLE", accent: "#34D6A4" },
  { item_id: "chat-floodlight", name: "Projektör", kind: "CHAT_STYLE", accent: "#72C7FF" },
  { item_id: "chat-derby", name: "Derbi Ateşi", kind: "CHAT_STYLE", accent: "#FF8A5C" },
  { item_id: "chat-neon", name: "Gece Deplasmanı", kind: "CHAT_STYLE", accent: "#B896FF" },
] as const;
export const isChatStyle = (value: unknown): value is ChatStyleId => chatStyleItems.some(item => item.item_id === value);
export async function getChatStyle(): Promise<ChatStyleId> { const value = await AsyncStorage.getItem(CHAT_STYLE_KEY); return isChatStyle(value) ? value : "chat-classic"; }
export async function setChatStyle(value: ChatStyleId): Promise<void> { await AsyncStorage.setItem(CHAT_STYLE_KEY, value); }
