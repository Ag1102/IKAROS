import { beforeEach, describe, expect, it } from "vitest";
import { getUnlocked, isUnlocked, recordResult, resetProgress } from "./progress";

describe("progreso de niveles", () => {
  beforeEach(() => resetProgress());

  it("al empezar solo está abierto el nivel 1", () => {
    expect(getUnlocked()).toBe(1);
    expect(isUnlocked(1)).toBe(true);
    expect(isUnlocked(2)).toBe(false);
  });

  it("una misión cumplida abre el nivel siguiente", () => {
    expect(isUnlocked(2)).toBe(false);
    recordResult(1, "success");
    expect(isUnlocked(2)).toBe(true);
  });

  it("un resultado parcial o fallido no abre nada", () => {
    recordResult(1, "partial");
    recordResult(1, "failure");
    expect(getUnlocked()).toBe(1);
  });

  it("no se pueden saltar niveles ni pasar del último", () => {
    recordResult(2, "success");
    expect(getUnlocked()).toBe(1);
    recordResult(1, "success");
    recordResult(2, "success");
    expect(getUnlocked()).toBe(2);
  });

  it("repetir un nivel anterior no vuelve a bloquear los siguientes", () => {
    recordResult(1, "success");
    recordResult(2, "success");
    recordResult(1, "failure");
    expect(getUnlocked()).toBe(2);
  });
});
