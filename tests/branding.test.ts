import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appName, displayDomain } from "@/lib/branding";

describe("branding", () => {
  const originalAppName = process.env.APP_NAME;
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    delete process.env.APP_NAME;
    delete process.env.APP_URL;
  });

  afterEach(() => {
    if (originalAppName === undefined) delete process.env.APP_NAME;
    else process.env.APP_NAME = originalAppName;
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  describe("appName", () => {
    it("cai no padrão sem APP_NAME", () => {
      expect(appName()).toBe("Grana");
    });

    it("usa o valor do ambiente", () => {
      process.env.APP_NAME = "Finanças da Ana";
      expect(appName()).toBe("Finanças da Ana");
    });
  });

  describe("displayDomain", () => {
    it("tira o esquema", () => {
      process.env.APP_URL = "https://x.com";
      expect(displayDomain()).toBe("x.com");
    });

    it("tira a barra final", () => {
      process.env.APP_URL = "https://x.com/";
      expect(displayDomain()).toBe("x.com");
    });

    it("aceita URL sem esquema", () => {
      process.env.APP_URL = "x.com";
      expect(displayDomain()).toBe("x.com");
    });

    it("corta o caminho", () => {
      process.env.APP_URL = "https://x.com/app";
      expect(displayDomain()).toBe("x.com");
    });

    it("é null sem APP_URL", () => {
      expect(displayDomain()).toBeNull();
    });

    it("é null com APP_URL em branco", () => {
      process.env.APP_URL = "  ";
      expect(displayDomain()).toBeNull();
    });
  });
});
