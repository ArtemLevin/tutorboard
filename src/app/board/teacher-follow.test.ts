import { describe, expect, it } from "vitest";
import type { BoardPresence } from "../../adapters/board-websocket/public";
import {
  chooseTeacher,
  resolveTeacherFollow,
  usableTeacherViewport,
  type TeacherFollowSelection,
} from "./teacher-follow";

const teacher: BoardPresence = {
  actorId: "teacher:one",
  clientId: "browser:teacher:1",
  cursor: null,
  displayName: "Преподаватель",
  role: "tutor",
  selectedObjectIds: [],
  viewport: { x: 120, y: -60, zoom: 1.5 },
};
const selection: TeacherFollowSelection = {
  actorId: teacher.actorId,
  clientId: teacher.clientId,
  scope: "board-one|student-1|epoch-A",
};

describe("QoL 2.6 authenticated presence viewport", () => {
  it("only allows instructor/admin roles with bounded finite cameras", () => {
    expect(usableTeacherViewport(teacher)).toEqual({
      offset: { x: 120, y: -60 },
      zoom: 1.5,
    });
    expect(usableTeacherViewport({ ...teacher, role: "student" })).toBeNull();
    expect(usableTeacherViewport({ ...teacher, role: "parent" })).toBeNull();
    expect(
      usableTeacherViewport({
        ...teacher,
        viewport: { x: 1e10, y: 0, zoom: 1 },
      }),
    ).toBeNull();
    expect(
      usableTeacherViewport({ ...teacher, viewport: { x: 0, y: 0, zoom: 64 } }),
    ).toBeNull();
    expect(
      usableTeacherViewport({
        ...teacher,
        viewport: { x: 0, y: 0, zoom: 0.01 },
      }),
    ).toBeNull();
    expect(usableTeacherViewport({ ...teacher, viewport: null })).toBeNull();
  });

  it("selects a stable authorized teacher and ignores student-sent cameras", () => {
    const second = {
      ...teacher,
      clientId: "browser:teacher:2",
      role: "admin" as const,
    };
    const student = {
      ...teacher,
      clientId: "browser:student",
      role: "student" as const,
    };
    expect(chooseTeacher([second, student, teacher])?.clientId).toBe(
      teacher.clientId,
    );
    expect(chooseTeacher([student])).toBeNull();
  });

  it("rejects stale actor, client, scope or disconnected/revoked updates", () => {
    const current = resolveTeacherFollow(selection, selection.scope, true, [
      teacher,
    ]);
    expect(current).toEqual({
      displayName: "Преподаватель",
      viewport: { offset: { x: 120, y: -60 }, zoom: 1.5 },
    });
    expect(
      resolveTeacherFollow(selection, "board-two|student-1|epoch-A", true, [
        teacher,
      ]),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, "board-one|student-1|epoch-B", true, [
        teacher,
      ]),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, selection.scope, false, [teacher]),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, selection.scope, true, []),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, selection.scope, true, [
        { ...teacher, actorId: "teacher:impostor" },
      ]),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, selection.scope, true, [
        { ...teacher, clientId: "browser:teacher:reconnected" },
      ]),
    ).toBeNull();
    expect(
      resolveTeacherFollow(selection, selection.scope, true, [
        { ...teacher, role: "student" },
      ]),
    ).toBeNull();
  });
});
