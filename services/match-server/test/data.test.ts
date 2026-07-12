import { afterEach, describe, expect, it, vi } from "vitest";
import { createMatchData } from "../src/data";

afterEach(() => vi.unstubAllGlobals());
describe("Supabase server-only data adapter", () => {
  it("pins a version and validates without exposing answer lists", async () => {
    const fetchMock=vi.fn(async (input:string|URL|Request,init?:RequestInit) => {
      if(String(input).includes("/game_settings?")) return Response.json([{key:"team_pool_size",value:12},{key:"answer_seconds",value:18}]);
      const name=String(input).split("/").pop(); const body=JSON.parse(String(init?.body));
      if(name==="get_match_bootstrap") return Response.json({football_data_version_id:"v1",clubs:[{id:"arsenal",name:"Arsenal"},{id:"real",name:"Real"}]});
      if(name==="match_pair_has_answers") return Response.json(true);
      if(name==="match_validate_answer") return Response.json(body.answer_normalized==="mesut ozil");
      return Response.json({club_a_id:"arsenal",club_a_name:"Arsenal",club_b_id:"real",club_b_name:"Real"});
    });
    vi.stubGlobal("fetch",fetchMock); const data=await createMatchData({SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"secret"},"v1");
    expect(data.versionId).toBe("v1"); const bootstrapCall=fetchMock.mock.calls.find(call=>String(call[0]).includes("get_match_bootstrap")); expect(JSON.parse(String(bootstrapCall?.[1]?.body)).pool_size).toBe(200); expect(data.rules.teamPoolSize).toBe(12); expect(data.rules.answerMs).toBe(18_000); expect(await data.hasPair("arsenal","real")).toBe(true); expect(await data.validate("arsenal","real","mesut ozil")).toBe(true); expect(await data.validate("arsenal","real","mesutt ozil")).toBe(false);
  });

  it("writes idempotent persistence RPC payloads without using client credentials", async () => {
    const fetchMock=vi.fn(async (input:string|URL|Request) => Response.json(String(input).includes("/game_settings?") ? [] : String(input).split("/").pop()==="get_match_bootstrap" ? {football_data_version_id:"version-id",clubs:[{id:"arsenal",name:"Arsenal"},{id:"real",name:"Real"}]} : "persisted-id"));
    vi.stubGlobal("fetch",fetchMock);
    const data=await createMatchData({SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service-secret"});
    await data.persistStart("room-1",["11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222"],"FRIEND");
    await data.persistRound({roomKey:"room-1",ordinal:1,suddenDeath:false,clubs:["arsenal","real"],winnerId:null,submissions:[],scores:{}});
    await data.persistFinish("room-1","11111111-1111-1111-1111-111111111111",{});
    expect(fetchMock.mock.calls.slice(2).map(call=>String(call[0]).split("/").pop())).toEqual(["match_persist_start","match_persist_round","match_persist_finish"]);
    const startInit=fetchMock.mock.calls[2]?.[1] as RequestInit; expect(startInit.headers).toMatchObject({apikey:"service-secret"});
    expect(JSON.parse(String(startInit.body))).toMatchObject({p_room_key:"room-1",p_version_id:"version-id",p_match_mode:"FRIEND"});
  });
});
