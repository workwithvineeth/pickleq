import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {clubServerConfig} from '../../club/config';
import {serverBackend} from '../../club';
import type {OfficialMatch,StudioData} from '../../club/playerStudio';
export type PracticeKind='practice_match'|'drill'|'training';
export interface PracticeInput {kind:PracticeKind;scoreText:string;minutes?:number;focusTags:string[];feel?:number;playedAt:string;partner?:string;opponents?:string}
export interface PracticeSession extends PracticeInput {id:string;createdAt?:string}
export interface GoalInput {title:string;target:number;progress:number;due?:string}
export interface PlayerGoal extends GoalInput {id:string}
export interface SharingOptions {practice_results:boolean;practice_vs_tournament:boolean;training_hours:boolean;coach_notes:boolean;goals_badges:boolean}
export const PRIVATE_SHARING:SharingOptions={practice_results:false,practice_vs_tournament:false,training_hours:false,coach_notes:false,goals_badges:false};
export interface PublicRallyPlayer {playerId:string;name:string;club:string;city?:string;duprSingles?:number;duprDoubles?:number;ranking?:number;photoUrl?:string;official:OfficialMatch[];shared:{practiceResults?:PracticeSession[];trainingHours?:number;coachNotes?:string[];goalsBadges?:PlayerGoal[];practiceVsTournament?:{official:number;practice:number}}}
export interface MyRallyStudio {ownerId:string;official:StudioData;practice:PracticeSession[];goals:PlayerGoal[];sharing:SharingOptions}
type Row=Record<string,unknown>;
let client:SupabaseClient|undefined;
export function rallyStudioClient():SupabaseClient {
 if(client)return client;const cfg=clubServerConfig();if(!cfg)throw new Error('My Player Studio needs the RallyQ server.');
 client=createClient(cfg.url,cfg.key,{auth:{storageKey:'pq-club-auth',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce'}});return client;
}
const rows=(v:unknown):Row[]=>Array.isArray(v)?v as Row[]:[];
const text=(v:unknown)=>typeof v==='string'?v:'';
const number=(v:unknown)=>v===null||v===undefined?undefined:Number(v);
const err=(e:{message:string}|null)=>{if(e)throw new Error(e.message)};
export function practiceProblem(p:PracticeInput):string {
 if(!['practice_match','drill','training'].includes(p.kind))return 'Choose a session type.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.playedAt)||!Number.isFinite(Date.parse(p.playedAt+'T00:00:00Z')))return 'Choose the date you played.';
 if(p.playedAt>new Date().toISOString().slice(0,10))return 'The session date cannot be in the future.';
 if(p.kind==='practice_match'&&!p.scoreText.trim())return 'Enter the score.';
 if(p.kind!=='practice_match'&&(!Number.isInteger(p.minutes)||p.minutes!<1||p.minutes!>600))return 'Minutes must be from 1 to 600.';
 if(p.feel!==undefined&&(!Number.isInteger(p.feel)||p.feel<1||p.feel>5))return 'Choose how it felt from 1 to 5.';
 if(p.scoreText.length>160||(p.partner?.length??0)>120||(p.opponents?.length??0)>240)return 'Shorten the score or player names.';
 if(p.focusTags.length>12||p.focusTags.join(',').length>500)return 'Choose up to 12 short focus tags.';
 return '';
}
export function goalProblem(g:GoalInput):string {if(!g.title.trim()||g.title.length>160)return 'Give the goal a short title.';if(!Number.isFinite(g.target)||g.target<=0||g.target>1000000)return 'Enter a target above zero.';if(!Number.isFinite(g.progress)||g.progress<0||g.progress>1000000)return 'Progress must be zero or more.';return ''}
export const toPractice=(r:Row):PracticeSession=>({id:text(r.id),kind:r.kind as PracticeKind,scoreText:text(r.score_text),minutes:number(r.minutes),focusTags:Array.isArray(r.focus_tags)?r.focus_tags.map(String):[],feel:number(r.feel),playedAt:text(r.played_at),partner:text(r.partner)||undefined,opponents:text(r.opponents)||undefined,createdAt:text(r.created_at)||undefined});
export const toGoal=(r:Row):PlayerGoal=>({id:text(r.id),title:text(r.title),target:Number(r.target),progress:Number(r.progress),due:text(r.due)||undefined});
const toOfficial=(r:Row):OfficialMatch=>({id:text(r.id),club:text(r.club),tournament:text(r.tournament),tournamentId:text(r.tournament_id),division:text(r.division)||undefined,kind:r.kind as OfficialMatch['kind'],stage:r.stage as OfficialMatch['stage'],playedOn:text(r.played_on),format:(r.format??{})as OfficialMatch['format'],games:rows(r.games).map(g=>({a:Number(g.a),b:Number(g.b),...(g.points?{points:text(g.points)}:{})})),winner:r.winner as 'A'|'B',mySide:r.my_side as 'A'|'B',me:text(r.me),sideA:rows(r.side_a).map(p=>({id:text(p.id),name:text(p.name)})),sideB:rows(r.side_b).map(p=>({id:text(p.id),name:text(p.name)}))});
export class RallyStudioStore {
 constructor(privateClient?:SupabaseClient){this.sb=privateClient??rallyStudioClient()}private sb:SupabaseClient;
 async owner(){const {data,error}=await this.sb.auth.getSession();err(error);const id=data.session?.user.id;if(!id)throw new Error('Sign in to My Player Studio.');return id}
 async load():Promise<MyRallyStudio>{const ownerId=await this.owner(),b=serverBackend();if(!b)throw new Error('My Player Studio needs the RallyQ server.');const[official,practice,goals,sharing]=await Promise.all([b.studioData(),this.sb.from('practice_sessions').select('id,kind,score_text,minutes,focus_tags,feel,played_at,partner,opponents,created_at').eq('player',ownerId).order('played_at',{ascending:false}).order('created_at',{ascending:false}),this.sb.from('player_goals').select('id,title,target,progress,due').eq('player',ownerId).order('created_at'),this.sb.from('profile_sharing').select('practice_results,practice_vs_tournament,training_hours,coach_notes,goals_badges').eq('player',ownerId).maybeSingle()]);err(practice.error);err(goals.error);err(sharing.error);return{ownerId,official,practice:rows(practice.data).map(toPractice),goals:rows(goals.data).map(toGoal),sharing:{...PRIVATE_SHARING,...sharing.data}}}
 async savePractice(p:PracticeInput){const problem=practiceProblem(p);if(problem)throw new Error(problem);const player=await this.owner();const r=await this.sb.from('practice_sessions').insert({player,kind:p.kind,score_text:p.scoreText.trim(),minutes:p.minutes??null,focus_tags:p.focusTags,feel:p.feel??null,played_at:p.playedAt,partner:p.partner?.trim()||null,opponents:p.opponents?.trim()||null}).select('id').single();err(r.error);return text(r.data?.id)}
 async saveGoal(g:GoalInput,id?:string){const problem=goalProblem(g);if(problem)throw new Error(problem);const player=await this.owner(),row={player,title:g.title.trim(),target:g.target,progress:g.progress,due:g.due||null};const r=await(id?this.sb.from('player_goals').update(row).eq('id',id).eq('player',player):this.sb.from('player_goals').insert(row));err(r.error)}
 async removeGoal(id:string){const player=await this.owner();const r=await this.sb.from('player_goals').delete().eq('id',id).eq('player',player);err(r.error)}
 async saveSharing(s:SharingOptions,coachNotes:string[]=[]){const player=await this.owner();const r=await this.sb.from('profile_sharing').upsert({player,...Object.fromEntries(Object.keys(PRIVATE_SHARING).map(k=>[k,!!s[k as keyof SharingOptions]])),coach_notes_text:s.coach_notes?coachNotes.slice(0,8).map(n=>n.slice(0,600)):[],updated_at:new Date().toISOString()},{onConflict:'player'});err(r.error)}
}
export async function loadPublicPlayer(playerId:string,sb:SupabaseClient=rallyStudioClient()):Promise<PublicRallyPlayer|null>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(playerId))return null;
 const{data,error}=await sb.rpc('rallyq_public_player',{p_player:playerId});err(error);if(!data)return null;const r=data as Row,shared=(r.shared??{})as Row;
 return{playerId:text(r.player_id),name:text(r.name),club:text(r.club),city:text(r.city)||undefined,duprSingles:number(r.dupr_singles),duprDoubles:number(r.dupr_doubles),official:rows(r.official).map(toOfficial),shared:{...(Array.isArray(shared.practice_results)?{practiceResults:rows(shared.practice_results).map(toPractice)}:{}),...(typeof shared.training_hours==='number'?{trainingHours:shared.training_hours}:{}),...(Array.isArray(shared.coach_notes)?{coachNotes:shared.coach_notes.map(String)}:{}),...(Array.isArray(shared.goals_badges)?{goalsBadges:rows(shared.goals_badges).map(toGoal)}:{}),...(shared.practice_vs_tournament?{practiceVsTournament:shared.practice_vs_tournament as {official:number;practice:number}}:{})}};
}
export function samplePublicPlayer():PublicRallyPlayer {return{playerId:'00000000-0000-4000-8000-000000000001',name:'Kiran Sample',club:'Sample Pickleball Club',city:'Hyderabad',duprDoubles:4.62,official:[{id:'sample-official',club:'Sample Pickleball Club',tournament:'Sample Night Open',tournamentId:'sample-event',division:'Open doubles',kind:'doubles',stage:'qf',playedOn:'2026-11-08',format:{pointsTo:11,bestOf:3,scoring:'rally'},games:[{a:11,b:8,points:'ABAAABAAABAAABAAABA'},{a:11,b:7,points:'AAABAAABAAABAAABAA'}],winner:'A',mySide:'A',me:'sample-player',sideA:[{id:'sample-player',name:'Kiran Sample'},{id:'sample-partner',name:'Alex Sample'}],sideB:[{id:'sample-other',name:'Robin Sample'},{id:'sample-fourth',name:'Jamie Sample'}]}],shared:{}}}
