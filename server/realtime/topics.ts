export function parentTopic(parentId: string): string {
  return `parent:${parentId}`;
}

export function deviceTopic(deviceId: string): string {
  return `device:${deviceId}`;
}
