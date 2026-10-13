// Keep the existing adapter import path stable for renderer and test consumers.
export {
  measureBoardFrameTrace,
  recordBoardFrameTrace,
  type BoardFrameTraceEvent,
} from "../../core/board/diagnostics/board-frame-trace";
