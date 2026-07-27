import { describe, expect, it } from "vitest";
import { MatchEngine, pairKey, type PairAnswers } from "../src/index";
const clubs=[{id:"arsenal",name:"Arsenal"},{id:"real",name:"Real Madrid"},{id:"same",name:"Same"}];
const data:PairAnswers={hasPair:(a,b)=>pairKey(a,b)===pairKey("arsenal","real"),answers:()=>new Set(["mesut ozil","dani ceballos"])};
function answering(deadline=100){const e=new MatchEngine(["p1","p2"]);e.startAnswering(deadline);return e;}
describe("authoritative match engine",()=>{
  it("awards the first of two correct submissions",()=>{const e=answering();e.submit("p2","Mesut Özil",2,data.answers("", ""));e.submit("p1","Dani Ceballos",3,data.answers("", ""));expect(e.reveal().roundWinnerId).toBe("p2")});
  it("lets a later correct answer beat an earlier wrong answer",()=>{const e=answering();e.submit("p1","wrong",1,data.answers("", ""));e.submit("p2","Mesut Ozıl",2,data.answers("", ""));expect(e.reveal().roundWinnerId).toBe("p2")});
  it("does not score two wrong answers",()=>{const e=answering();e.submit("p1","x",1,new Set());e.submit("p2","y",2,new Set());expect(e.reveal().roundWinnerId).toBeNull()});
  it("rejects late and duplicate submissions",()=>{const e=answering(10);e.submit("p1","x",1,new Set());expect(()=>e.submit("p1","y",2,new Set())).toThrow("ALREADY_SUBMITTED");expect(()=>e.submit("p2","x",11,new Set())).toThrow("ANSWER_DEADLINE_PASSED")});
  it("rejects same, invalid and reused pairs",()=>{const e=new MatchEngine(["p1","p2"]);e.startSelection(clubs,10);e.select("p1","same");e.select("p2","same");e.confirm("p1");e.confirm("p2");expect(e.validateSelection(data)).toMatchObject({valid:false,reason:"SAME_CLUB"});e.select("p1","arsenal");e.select("p2","same");e.confirm("p1");e.confirm("p2");expect(e.validateSelection(data).reason).toBe("NO_COMMON_PLAYER");e.select("p1","arsenal");e.select("p2","real");e.confirm("p1");e.confirm("p2");expect(e.validateSelection(data).valid).toBe(true);e.startSelection(clubs,20);e.select("p1","real");e.select("p2","arsenal");e.confirm("p1");e.confirm("p2");expect(e.validateSelection(data).reason).toBe("PAIR_ALREADY_USED")});
  it("finishes at three points",()=>{const e=answering();for(let i=0;i<3;i++){if(i)e.startAnswering(100);e.submit("p1","Mesut Özil",i,data.answers("", ""));e.reveal()}expect(e.state.winnerId).toBe("p1")});
  it("honors server supplied score and round rules",()=>{const e=new MatchEngine(["p1","p2"],{winningScore:2,maximumRounds:5});for(let i=0;i<2;i++){e.startAnswering(100);e.submit("p1","Mesut Özil",i,data.answers("",""));e.reveal()}expect(e.state.winnerId).toBe("p1");expect(MatchEngine.restore(e.serialize()).rules).toEqual({winningScore:2,maximumRounds:5})});
  it("uses higher score after nine and sudden death on tie",()=>{const e=answering();for(let i=0;i<9;i++){if(i)e.startAnswering(100);if(i===0)e.submit("p1","Mesut Özil",i,data.answers("", ""));e.reveal()}expect(e.state.winnerId).toBe("p1");const t=answering();for(let i=0;i<9;i++){if(i)t.startAnswering(100);t.reveal()}expect(t.state.phase).toBe("SUDDEN_DEATH")});
  it("does not leak an opponent selection in selection snapshot",()=>{const e=new MatchEngine(["p1","p2"]);e.startSelection(clubs,10);e.select("p1","arsenal");e.select("p2","real");expect(e.snapshotFor("p1").selections).toEqual({p1:"arsenal"})});
  it("keeps searchable clubs separate from the suggested clubs",()=>{const e=new MatchEngine(["p1","p2"]);e.startSelection(clubs,10,clubs.slice(0,2));const snapshot=e.snapshotFor("p1");expect(snapshot.pool).toEqual(clubs.slice(0,2));expect(snapshot.searchable_clubs).toEqual(clubs);e.select("p1","same");expect(e.state.selections.get("p1")).toBe("same")});
  it("includes rules and phase-appropriate reveal or result data in reconnect snapshots",()=>{
    const revealEngine=new MatchEngine(["p1","p2"],{winningScore:2,maximumRounds:5});
    revealEngine.startAnswering(100);
    revealEngine.submit("p1","Mesut Özil",10,data.answers("",""));
    revealEngine.submit("p2","wrong",20,new Set());
    revealEngine.reveal();
    revealEngine.state.deadline=200;
    const revealSnapshot=revealEngine.snapshotFor("p1");
    expect(revealSnapshot.rules).toEqual({winning_score:2,maximum_rounds:5});
    expect(revealSnapshot.reveal).toMatchObject({round_winner_id:"p1",margin_ms:null,win_reason:"ONLY_CORRECT",reveal_deadline:200});
    expect(revealSnapshot.reveal?.submissions).toHaveLength(2);

    const finishedEngine=new MatchEngine(["p1","p2"],{winningScore:1,maximumRounds:5});
    finishedEngine.startAnswering(100);
    finishedEngine.submit("p1","Mesut Özil",10,data.answers("",""));
    finishedEngine.reveal();
    const finishedSnapshot=finishedEngine.snapshotFor("p1");
    expect(finishedSnapshot.result).toEqual({winner_id:"p1",sudden_death:false});
    expect(finishedSnapshot.reveal).toBeUndefined();

    const suddenDeathEngine=new MatchEngine(["p1","p2"],{winningScore:3,maximumRounds:1});
    suddenDeathEngine.startAnswering(100);
    suddenDeathEngine.reveal();
    suddenDeathEngine.state.deadline=200;
    const suddenDeathSnapshot=suddenDeathEngine.snapshotFor("p1");
    expect(suddenDeathSnapshot.phase).toBe("SUDDEN_DEATH");
    expect(suddenDeathSnapshot.reveal).toMatchObject({
      round_winner_id:null,
      win_reason:"NO_CORRECT",
      reveal_deadline:200,
      sudden_death:true,
    });
  });
  it("restores authoritative state after hibernation",()=>{const e=answering();e.submit("p1","Mesut Özil",2,data.answers("",""));const restored=MatchEngine.restore(e.serialize());expect(restored.state.submissions.get("p1")?.sequence).toBe(1);expect(()=>restored.submit("p1","Dani Ceballos",3,data.answers("",""))).toThrow("ALREADY_SUBMITTED")});
  it("supports a server-controlled test bot without awarding an incorrect bot answer",()=>{const e=new MatchEngine(["human","test-bot"]);e.ready("test-bot");expect(e.ready("human")).toBe(true);expect(e.ready("human")).toBe(false);e.startAnswering(100);e.submit("test-bot","cevap yok",1,new Set());e.submit("human","Mesut Özil",2,data.answers("",""));expect(e.reveal().roundWinnerId).toBe("human")});
});
