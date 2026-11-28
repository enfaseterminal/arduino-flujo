import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageManifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lockfile = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const releaseNotes = readFileSync(new URL("../docs/notas-v0.9.7.md", import.meta.url), "utf8");

describe("versión de publicación", () => {
  it("mantiene la versión 0.9.7 coherente en el paquete, lockfile y etiqueta accesible", () => {
    expect(packageManifest.version).toBe("0.9.7");
    expect(lockfile.version).toBe("0.9.7");
    expect(lockfile.packages[""].version).toBe("0.9.7");
    expect(html).toContain('data-app-version="0.9.7">FASE 9.7 · v0.9.7</span>');
  });

  it("enlaza notas que resumen las novedades y mantienen claro el alcance educativo", () => {
    expect(readme).toContain("docs/notas-v0.9.7.md");
    expect(releaseNotes).toContain("Arduino Uno");
    expect(releaseNotes).toContain("Nano clásico ATmega328P");
    expect(releaseNotes).toContain("proyecto JSON versionado");
    expect(releaseNotes).toContain("no compila ni ejecuta C++ arbitrario");
    expect(releaseNotes).toContain("no controla hardware físico");
  });
});
