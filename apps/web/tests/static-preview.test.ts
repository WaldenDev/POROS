import { test } from "node:test";
import assert from "node:assert/strict";
import recording from "../src/explorer/debug/local-llm.json";
import { isStaticPreview } from "../src/explorer/debug/mode";

test("static preview is development-only and has an explicit live override", () => {
  assert.equal(isStaticPreview(true, ""), true);
  assert.equal(isStaticPreview(true, "?mode=live"), false);
  assert.equal(isStaticPreview(false, ""), false);
  assert.equal(isStaticPreview(false, "?mode=static"), false);
});

test("explicit demo build stays static even with a live query parameter", () => {
  assert.equal(isStaticPreview(false, "", true), true);
  assert.equal(isStaticPreview(false, "?mode=live", true), true);
});

test("recorded projects, facts, relationships and routes reference real snapshot members", () => {
  const { repos, atlas } = recording.result;
  const ids = new Set(repos.map(repo => repo.id));
  const facts = atlas.understandings.flatMap(item => item.facts);
  const factIds = new Set(facts.map(fact => fact.id));
  assert.equal(ids.size, 12);
  assert.equal(facts.length, 61);
  assert.equal(atlas.relations.length, 8);
  assert.equal(atlas.landscape.routes.length, 6);
  for (const item of atlas.understandings) {
    assert.ok(ids.has(item.repo_id));
    assert.equal(repos.find(repo => repo.id === item.repo_id)?.name, item.name);
    for (const fact of item.facts) {
      assert.equal(fact.repo_id, item.repo_id);
      assert.ok(fact.citation.url.startsWith("https://"));
      assert.ok(fact.citation.excerpt.length > 0);
    }
  }
  for (const relation of atlas.relations) {
    assert.ok(ids.has(relation.source) && ids.has(relation.target));
    assert.ok(relation.fact_ids.every(id => factIds.has(id)));
  }
  for (const route of atlas.landscape.routes)
    for (const member of route.members) {
      assert.ok(ids.has(member.repo_id));
      assert.ok(member.fact_ids.every(id => factIds.has(id)));
    }
});
