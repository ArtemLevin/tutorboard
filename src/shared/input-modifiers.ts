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