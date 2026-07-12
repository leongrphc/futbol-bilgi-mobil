import { readFile } from "node:fs/promises";
const fixture=JSON.parse(await readFile(new URL("../../../tools/football-data-builder/exports/club_pairs.json",import.meta.url),"utf8"));
const fixturePairs=Array.isArray(fixture)?fixture:fixture.club_pairs;
const key=(a,b)=>[a,b].sort().join(":");
const answers=new Map(fixturePairs.map(pair=>[key(pair.club_a.slug,pair.club_b.slug),pair.players[0]?.name]));
const matchId=`smoke-${Date.now()}`,base=process.env.MATCH_URL??"ws://127.0.0.1:8787";
let sequence=0,pool=[],clubs=[],rounds=0,controller=null;const used=new Set();
const send=(socket,event_type,payload={})=>socket.send(JSON.stringify({protocol_version:1,match_id:matchId,event_type,command_id:`smoke-${++sequence}`,payload}));
const sendWhenOpen=(socket,event_type,payload={})=>{if(socket.readyState===WebSocket.OPEN)send(socket,event_type,payload);else setTimeout(()=>sendWhenOpen(socket,event_type,payload),20);};
const sockets=[new WebSocket(`${base}/match/${matchId}?player=p1`),new WebSocket(`${base}/match/${matchId}?player=p2`)];
const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error("smoke timeout")),120000);
  sockets.forEach((socket,index)=>{
    socket.onerror=()=>reject(new Error(`socket ${index+1} failed`));
    socket.onmessage=({data})=>{
      const event=JSON.parse(String(data));if(controller===null)controller=index;if(index!==controller)return;
      if(event.event_type==="ERROR")reject(new Error(`server error: ${JSON.stringify(event.payload)}`));
      if(event.event_type==="READY_CHECK_STARTED")sockets.forEach(ws=>sendWhenOpen(ws,"READY_CONFIRM"));
      if(event.event_type==="TEAM_POOL_CREATED")pool=event.payload.clubs;
      if(event.event_type==="TEAM_SELECTION_STARTED"){
        let selected;
        outer:for(const a of pool)for(const b of pool)if(a.id!==b.id&&answers.has(key(a.id,b.id))&&!used.has(key(a.id,b.id))){selected=[a.id,b.id];break outer;}
        if(selected){send(sockets[0],"TEAM_SELECT",{club_id:selected[0]});send(sockets[1],"TEAM_SELECT",{club_id:selected[1]});send(sockets[0],"TEAM_CONFIRM");send(sockets[1],"TEAM_CONFIRM");}
      }
      if(event.event_type==="TEAMS_REVEALED"){clubs=event.payload.club_ids;used.add(key(clubs[0],clubs[1]));}
      if(event.event_type==="ANSWER_PHASE_STARTED"){
        const answer=answers.get(key(clubs[0],clubs[1])); if(!answer)return reject(new Error(`fixture answer missing for ${clubs.join("/")}`));
        send(sockets[0],"ANSWER_SUBMIT",{answer});send(sockets[1],"ANSWER_SUBMIT",{answer:"kesinlikle yanlis"});
      }
      if(event.event_type==="REVEAL_STARTED"){rounds++;if(event.payload.scores.p1!==rounds||event.payload.scores.p2!==0)reject(new Error(`unexpected score ${JSON.stringify(event.payload.scores)}`));}
      if(event.event_type==="MATCH_FINISHED"){clearTimeout(timer);resolve(event.payload);}
    };
  });
});
try{if(result.winner_id!=="p1"||rounds!==3)throw new Error(`unexpected finish ${JSON.stringify({result,rounds})}`);console.log(JSON.stringify({ok:true,matchId,rounds,winner:result.winner_id}));}finally{sockets.forEach(ws=>ws.close());}
