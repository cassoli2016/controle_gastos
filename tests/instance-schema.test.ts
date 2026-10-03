import { describe, expect, it } from "vitest";
import { assertSchemaName, pendingMigrations, parseInstanceSchemas, envBlock } from "@/lib/instance-schema";

describe("assertSchemaName", () => {
  it("aceita nome simples", () => expect(assertSchemaName("fulano")).toBe("fulano"));
  it("aceita dígitos e underscore", () => expect(assertSchemaName("ana_2")).toBe("ana_2"));
  it("recusa public — é o schema do dono", () =>
    expect(() => assertSchemaName("public")).toThrow(/public/i));
  it("recusa aspas e ponto-e-vírgula — o CREATE SCHEMA é interpolado", () => {
    expect(() => assertSchemaName('x"; drop schema public cascade; --')).toThrow();
    expect(() => assertSchemaName("x'y")).toThrow();
  });
  it("recusa espaço, maiúscula e vazio", () => {
    for (const n of ["com espaco", "Fulano", "", "  "]) expect(() => assertSchemaName(n)).toThrow();
  });
  it("recusa nome começando com dígito", () => expect(() => assertSchemaName("2ana")).toThrow());
  it("recusa nome maior que o limite de identificador do Postgres", () => {
    expect(() => assertSchemaName("a".repeat(63))).not.toThrow();
    expect(() => assertSchemaName("a".repeat(64))).toThrow(/63/);
  });
});

describe("pendingMigrations", () => {
  it("devolve as que faltam, na ordem", () =>
    expect(pendingMigrations(["a", "b", "c"], ["a"])).toEqual(["b", "c"]));
  it("schema em dia não tem pendência", () =>
    expect(pendingMigrations(["a", "b"], ["a", "b"])).toEqual([]));
  it("schema novo recebe todas", () =>
    expect(pendingMigrations(["a", "b"], [])).toEqual(["a", "b"]));
  it("ignora registro desconhecido no banco", () =>
    expect(pendingMigrations(["a"], ["a", "antiga"])).toEqual([]));
});

describe("parseInstanceSchemas", () => {
  it("separa por vírgula e apara espaço", () =>
    expect(parseInstanceSchemas(" ana , bruno ")).toEqual(["ana", "bruno"]));
  it("ignora vazio e duplicata", () =>
    expect(parseInstanceSchemas("ana,,ana, ")).toEqual(["ana"]));
  it("variável ausente é lista vazia", () => expect(parseInstanceSchemas(undefined)).toEqual([]));
});

describe("envBlock", () => {
  it("traz o schema na connection string e nas variáveis", () => {
    const txt = envBlock({ schema: "ana", appName: "Grana da Ana", appUrl: "https://ana.app", password: "p", authSecret: "s" });
    expect(txt).toContain("DATABASE_SCHEMA=ana");
    expect(txt).toContain("APP_NAME=Grana da Ana");
    expect(txt).toContain("APP_PASSWORD=p");
    expect(txt).toContain("AUTH_SECRET=s");
  });
});
