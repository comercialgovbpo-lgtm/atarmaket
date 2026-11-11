import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCnpj, parseBrNumber } from "../src/lib/validators";
import { evaluateAdhesion } from "../src/lib/atas/compliance";
import { suggestCategory } from "../src/lib/atas/categorize";
import { heuristicExtract } from "../src/lib/extraction/heuristic";
import { parseControlNumber, plausibleDate } from "../src/lib/sync/pncp-client";
import { ataLabel } from "../src/lib/atas/status";

test("CNPJ: dígitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("00000000000000"), false);
});

test("números em formato brasileiro", () => {
  assert.equal(parseBrNumber("1.234,56"), 1234.56);
  assert.equal(parseBrNumber("R$ 4.500,00"), 4500);
  assert.equal(parseBrNumber("12.5"), 12.5);
  assert.equal(parseBrNumber(""), null);
});

test("art. 86: vedação federal e limite de 50%", () => {
  const base = { validityEnd: "2099-01-01", cancelled: false, status: "importada", validityConfirmed: false, sourceReportedAdhesion: true };
  const fed = evaluateAdhesion({ ...base, managingSphere: "municipal", requesterSphere: "federal" });
  assert.ok(fed.some((c) => c.id === "esfera" && c.level === "impeditivo"));
  const q = evaluateAdhesion({ ...base, managingSphere: "estadual", requesterSphere: "municipal", itemQuantity: 100, intendedQuantity: 60 });
  assert.ok(q.some((c) => c.id === "limite_individual" && c.level === "impeditivo"));
  const ok = evaluateAdhesion({ ...base, managingSphere: "estadual", itemQuantity: 100, intendedQuantity: 50 });
  assert.ok(ok.some((c) => c.id === "limite_individual" && c.level === "ok"));
  assert.ok(ok.some((c) => c.id === "saldo" && c.level === "atencao"), "saldo nunca é apresentado como confirmado");
});

test("art. 86: ata vencida é sinalizada", () => {
  const r = evaluateAdhesion({ validityEnd: "2020-01-01", cancelled: false, status: "importada", validityConfirmed: false, sourceReportedAdhesion: null, managingSphere: "federal" });
  assert.ok(r.some((c) => c.id === "vigencia" && c.level === "impeditivo"));
});

test("categorização por palavras-chave", () => {
  const cats = [{ id: "s", slug: "saude", keywords: ["medicamento"] }, { id: "t", slug: "tecnologia", keywords: ["notebook"] }, { id: "o", slug: "outros", keywords: [] }];
  assert.equal(suggestCategory(["Aquisição de MEDICAMENTOS diversos"], cats), "s");
  assert.equal(suggestCategory(["algo sem relação"], cats), "o");
});

test("extração heurística", () => {
  const t = "ATA DE REGISTRO DE PREÇOS Nº 012/2026\nPREGÃO ELETRÔNICO Nº 7/2026\nO MUNICIPIO DE EXEMPLO, inscrito no CNPJ sob o nº 11.222.333/0001-81, e a EMPRESA X LTDA, inscrita no CNPJ sob o nº 11.444.777/0001-61\nVIGÊNCIA: de 01/02/2026 a 31/01/2027\n1 Cadeira giratória UN 10 350,00 3.500,00";
  const r = heuristicExtract(t);
  assert.equal(r.ata_number, "012/2026");
  assert.equal(r.validity_end, "2027-01-31");
  assert.equal(r.supplier_cnpj, "11444777000161");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].unit_price, 350);
});

test("PNCP: número de controle e datas implausíveis", () => {
  assert.deepEqual(parseControlNumber("18457226000181-1-000015/2023-000001"), { cnpj: "18457226000181", seq: 15, ano: 2023, seqAta: 1 });
  assert.equal(plausibleDate("7203-07-27"), null);
  assert.equal(ataLabel("045/2026", 2026), "045/2026");
  assert.equal(ataLabel("45", 2026), "45/2026");
});
