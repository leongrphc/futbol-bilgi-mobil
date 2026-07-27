import { normalizeAnswer } from "@football-link/answer-normalizer";
import type { Club, MatchPhase } from "@football-link/shared";

export interface Submission { playerId: string; raw: string; normalized: string; sequence: number; receivedAt: number; correct: boolean }
export interface EngineRules { winningScore: number; maximumRounds: number }
export const defaultEngineRules: EngineRules = { winningScore: 3, maximumRounds: 9 };
export interface EngineState { phase: MatchPhase; players: [string,string]; ready: Set<string>; pool: Club[]; suggestions: Club[]; selections: Map<string,string>; confirmed: Set<string>; usedPairs: Set<string>; submissions: Map<string,Submission>; scores: Record<string,number>; normalRound: number; suddenDeath: boolean; deadline: number | null; sequence: number; winnerId: string | null }
export interface SerializedEngineState extends Omit<EngineState,"ready"|"selections"|"confirmed"|"usedPairs"|"submissions"> { ready:string[]; selections:[string,string][]; confirmed:string[]; usedPairs:string[]; submissions:[string,Submission][]; rules?: EngineRules }
export interface PairAnswers { hasPair(a:string,b:string): boolean; answers(a:string,b:string): ReadonlySet<string> }
export const pairKey = (a:string,b:string) => [a,b].sort().join(":");

export class MatchEngine {
  readonly state: EngineState;
  readonly rules: EngineRules;
  constructor(players: [string,string], rules: Partial<EngineRules> = {}) { this.rules={...defaultEngineRules,...rules}; this.state={phase:"READY_CHECK",players,ready:new Set(),pool:[],suggestions:[],selections:new Map(),confirmed:new Set(),usedPairs:new Set(),submissions:new Map(),scores:{[players[0]]:0,[players[1]]:0},normalRound:0,suddenDeath:false,deadline:null,sequence:0,winnerId:null}; }
  static restore(value:SerializedEngineState):MatchEngine { const engine=new MatchEngine(value.players,value.rules); Object.assign(engine.state,value,{ready:new Set(value.ready),selections:new Map(value.selections),confirmed:new Set(value.confirmed),usedPairs:new Set(value.usedPairs),submissions:new Map(value.submissions)}); return engine; }
  serialize():SerializedEngineState { return {...this.state,ready:[...this.state.ready],selections:[...this.state.selections],confirmed:[...this.state.confirmed],usedPairs:[...this.state.usedPairs],submissions:[...this.state.submissions],rules:this.rules}; }
  ready(playerId:string) { this.assertPlayer(playerId); const wasComplete=this.state.ready.size===2; this.state.ready.add(playerId); return !wasComplete&&this.state.ready.size===2; }
  startSelection(pool:Club[], deadline:number, suggestions:Club[]=pool) { if(pool.length<2) throw new Error("POOL_TOO_SMALL"); this.state.phase="TEAM_SELECTION"; this.state.pool=pool; this.state.suggestions=suggestions; this.state.selections.clear(); this.state.confirmed.clear(); this.state.deadline=deadline; }
  select(playerId:string,clubId:string) { this.assertPhase("TEAM_SELECTION"); this.assertPlayer(playerId); if(this.state.confirmed.has(playerId)) throw new Error("SELECTION_LOCKED"); if(!this.state.pool.some(c=>c.id===clubId)) throw new Error("CLUB_NOT_IN_POOL"); this.state.selections.set(playerId,clubId); }
  confirm(playerId:string) { if(!this.state.selections.has(playerId)) throw new Error("NO_SELECTION"); this.state.confirmed.add(playerId); return this.state.confirmed.size===2; }
  validateSelection(data:PairAnswers): {valid:boolean; reason?:string; clubs?:[string,string]} { const [p1,p2]=this.state.players; const a=this.state.selections.get(p1), b=this.state.selections.get(p2); if(!a||!b) throw new Error("SELECTION_INCOMPLETE"); this.state.phase="SELECTION_VALIDATION"; if(a===b) return this.invalid("SAME_CLUB"); const key=pairKey(a,b); if(this.state.usedPairs.has(key)) return this.invalid("PAIR_ALREADY_USED"); if(!data.hasPair(a,b)) return this.invalid("NO_COMMON_PLAYER"); this.state.usedPairs.add(key); return {valid:true,clubs:[a,b]}; }
  startAnswering(deadline:number) { this.state.phase="ANSWERING"; this.state.deadline=deadline; this.state.submissions.clear(); }
  submit(playerId:string,raw:string,receivedAt:number,answers:ReadonlySet<string>) { this.assertPhase("ANSWERING"); this.assertPlayer(playerId); if(this.state.deadline===null||receivedAt>this.state.deadline) throw new Error("ANSWER_DEADLINE_PASSED"); if(this.state.submissions.has(playerId)) throw new Error("ALREADY_SUBMITTED"); const normalized=normalizeAnswer(raw); if(!normalized) throw new Error("EMPTY_ANSWER"); const submission={playerId,raw,normalized,receivedAt,sequence:++this.state.sequence,correct:answers.has(normalized)}; this.state.submissions.set(playerId,submission); return submission; }
  reveal(): {roundWinnerId:string|null; finished:boolean; suddenDeath:boolean} { this.state.phase="REVEAL"; const correct=[...this.state.submissions.values()].filter(s=>s.correct).sort((a,b)=>a.sequence-b.sequence); const roundWinnerId=correct[0]?.playerId??null; if(roundWinnerId) this.state.scores[roundWinnerId]=(this.state.scores[roundWinnerId]??0)+1; if(!this.state.suddenDeath) this.state.normalRound++; if((roundWinnerId&&(this.state.scores[roundWinnerId]??0)>=this.rules.winningScore)||(this.state.suddenDeath&&roundWinnerId)) this.finish(roundWinnerId); else if(!this.state.suddenDeath&&this.state.normalRound>=this.rules.maximumRounds) { const [a,b]=this.state.players; const scoreA=this.state.scores[a]??0, scoreB=this.state.scores[b]??0; if(scoreA!==scoreB) this.finish(scoreA>scoreB?a:b); else {this.state.suddenDeath=true;this.state.phase="SUDDEN_DEATH";} } return {roundWinnerId,finished:this.state.winnerId!==null,suddenDeath:this.state.suddenDeath}; }
  snapshotFor(playerId:string) {
    this.assertPlayer(playerId);
    const ranked = [...this.state.submissions.values()]
      .filter(submission => submission.correct)
      .sort((a,b) => a.sequence-b.sequence);
    const roundWinnerId = ranked[0]?.playerId ?? null;
    const marginMs = ranked.length >= 2
      ? Math.max(0, ranked[1]!.receivedAt-ranked[0]!.receivedAt)
      : null;
    const winReason = ranked.length >= 2
      ? "FIRST_CORRECT"
      : ranked.length === 1
        ? "ONLY_CORRECT"
        : "NO_CORRECT";
    const reveal = this.state.phase === "REVEAL" || this.state.phase === "SUDDEN_DEATH"
      ? {
          submissions: [...this.state.submissions.values()].map(
            ({playerId,raw,correct,receivedAt,sequence}) => ({
              player_id:playerId,
              answer:raw,
              correct,
              received_at_ms:receivedAt,
              sequence,
            }),
          ),
          round_winner_id:roundWinnerId,
          scores:this.state.scores,
          margin_ms:marginMs,
          win_reason:winReason,
          reveal_deadline:this.state.deadline,
          sudden_death:this.state.suddenDeath,
        }
      : undefined;
    const result = this.state.phase === "FINISHED"
      ? {winner_id:this.state.winnerId,sudden_death:this.state.suddenDeath}
      : undefined;
    return {
      phase:this.state.phase,
      pool:this.state.suggestions.length?this.state.suggestions:this.state.pool.slice(0,6),
      searchable_clubs:this.state.pool,
      selections:this.state.phase==="TEAM_SELECTION"
        ? {[playerId]:this.state.selections.get(playerId)??null}
        : Object.fromEntries(this.state.selections),
      confirmed:[...this.state.confirmed].includes(playerId),
      scores:this.state.scores,
      normalRound:this.state.normalRound,
      suddenDeath:this.state.suddenDeath,
      deadline:this.state.deadline,
      winnerId:this.state.winnerId,
      rules:{
        winning_score:this.rules.winningScore,
        maximum_rounds:this.rules.maximumRounds,
      },
      ...(reveal?{reveal}:{}),
      ...(result?{result}:{}),
    };
  }
  private invalid(reason:string) { this.state.phase="TEAM_SELECTION"; this.state.selections.clear();this.state.confirmed.clear();return {valid:false,reason}; }
  private finish(id:string) {this.state.winnerId=id;this.state.phase="FINISHED";}
  private assertPhase(p:MatchPhase){if(this.state.phase!==p)throw new Error(`INVALID_PHASE:${this.state.phase}`)}
  private assertPlayer(id:string){if(!this.state.players.includes(id))throw new Error("NOT_A_PLAYER")}
}
