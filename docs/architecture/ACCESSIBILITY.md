# Accessibility and keyboard workflow

TutorBoard keeps every persistent action available without a pointer:

- semantic toolbars and native controls expose visible focus;
- tool shortcuts select navigation, selection and drawing modes;
- arrow keys move the current selection by one world unit and
  `Shift+Arrow` moves it by ten;
- standard undo/redo, clipboard, delete and escape shortcuts remain available;
- the `?` shortcut and toolbar button open an in-product shortcut reference;
- the shortcut dialog restores focus to its opener;
- canvas movement announces a concise update through a polite live region;
- layer controls provide a native keyboard-accessible object list;
- `prefers-reduced-motion` removes non-essential animation and smooth scrolling.

The canvas itself is focusable and retains its application label. Browser tests
cover semantic toolbar discovery, an entirely keyboard-driven object move,
shortcut help, Escape dismissal and focus restoration.
