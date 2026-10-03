import { describe, it, expect } from "vitest";
import { CHANGELOG } from "@/lib/changelog";
import { version } from "@/package.json";

describe("CHANGELOG", () => {
  it("não está vazio e a entrada mais recente é a versão do app", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG[0].version).toBe(version);
  });

  it("versões semver e datas YYYY-MM-DD", () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ordem decrescente por data", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });

  it("título e itens preenchidos", () => {
    for (const e of CHANGELOG) {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.items.length).toBeGreaterThan(0);
      for (const item of e.items) expect(item.length).toBeGreaterThan(0);
    }
  });

  // Estas duas guardas são rede de REGRESSÃO para dado pessoal já achado — elas só
  // pegam valor "R$ <dígito>" e os termos já catalogados abaixo. Não substituem ler a
  // entrada nova antes de publicar: a 1.14.0 ("Seguro C3 e Seguro Duster") passou pelas
  // duas sem disparar nada, porque "C3"/"Duster" não casam com nenhuma regra — só uma
  // leitura humana pegou. Ao adicionar uma entrada, releia com os olhos.
  const TERMOS_PESSOAIS = [
    "cassoli", "heitor", "audrey", "hana", "gobrax", "marcos nunes",
    "nucel", "ultravioleta", "franciscana", "psico", "duster",
  ];

  it("nenhuma entrada expõe valor em reais", () => {
    for (const e of CHANGELOG)
      for (const item of [e.title, ...e.items])
        expect(item, `${e.version}: "${item.slice(0, 60)}…"`).not.toMatch(/R\$\s*\d/);
  });

  it("nenhuma entrada cita nome próprio de pessoa, conta ou empresa", () => {
    for (const e of CHANGELOG)
      for (const item of [e.title, ...e.items])
        for (const termo of TERMOS_PESSOAIS)
          expect(item.toLowerCase(), `${e.version} cita "${termo}"`).not.toContain(termo);
  });
});
