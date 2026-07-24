export type JsonPrimitive = boolean | null | number | string;

export type JsonValue =
  JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];
