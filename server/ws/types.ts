export type WSData =
  | { kind: "parent"; parentId: string }
  | { kind: "device"; deviceId: string; parentId: string };
