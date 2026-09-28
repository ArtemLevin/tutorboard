export interface InputModifiers {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

export const noInputModifiers: InputModifiers = {
  alt: false,
  ctrl: false,
  meta: false,
  shift: false,
};

export function inputModifiersEqual(
  left: InputModifiers,
  right: InputModifiers,
): boolean {
  return (
    left.alt === right.alt &&
    left.ctrl === right.ctrl &&
    left.meta === right.meta &&
    left.shift === right.shift
  );
}
