import {describe,expect,it} from 'vitest';
import {contactHref,hostLine,primaryAction} from './RallyEvent';

describe('event primary button', () => {
  it('follows the event state', () => {
    expect(primaryAction({status:'done',registrationOpen:true})).toEqual({label:'See the results',to:'results'});
    expect(primaryAction({status:'live',registrationOpen:true})).toEqual({label:'Live scores',to:'live'});
    expect(primaryAction({status:'draft',registrationOpen:true})).toEqual({label:'Enter the event',to:'enter'});
    expect(primaryAction({status:'draft',registrationOpen:false,contact:'98765 43210'})).toEqual({label:'Entries closed',to:null});
    expect(primaryAction({status:'draft',registrationOpen:false})).toEqual({label:'Entries closed',to:null});
  });
  it('turns the organiser contact into a link only when it is one', () => {
    expect(contactHref('WhatsApp 98765 43210')).toBe('https://wa.me/919876543210');
    expect(contactHref('+44 7700 900123')).toBe('https://wa.me/447700900123');
    expect(contactHref('Email desk@club.test')).toBe('mailto:desk@club.test');
    expect(contactHref('https://club.test/contact')).toBe('https://club.test/contact');
    expect(contactHref('Ask at the desk')).toBeNull();
    expect(contactHref('javascript:alert(1)')).toBeNull();
  });
});

describe('host line', () => {
  it('does not repeat the club name when the venue already has it', () => {
    expect(hostLine('Cedar Club','Cedar Club, Maple Road')).toBe('Cedar Club, Maple Road');
  });
  it('joins club and venue when they differ, and falls back to the club', () => {
    expect(hostLine('Banyan Courts','Maple Road, Hyderabad')).toBe('Banyan Courts at Maple Road, Hyderabad');
    expect(hostLine('Banyan Courts',undefined)).toBe('Banyan Courts');
  });
});
import {eventValues} from './RallyEvent';
import type {PublicEvent} from '../../club/backend';
describe('event page values',()=>{
 const ev={slug:'s',name:'Cup',club:'Banyan',startDate:'2026-11-22',startTime:'16:00',status:'draft',registrationOpen:true,contact:'98765 43210',divisions:[{id:'d',name:'Open',kind:'doubles',rules:{fee:800},taken:1}]} as unknown as PublicEvent;
 it('shows the fee and keeps contact actions disabled pending owner approval',()=>{
  const v=eventValues(ev,undefined,undefined,'Info',()=>{},()=>{});
  expect(v.entryLine).toBe('₹800 per team');expect(v.canMessage).toBe(false);
  expect(JSON.stringify(v)).not.toMatch(/98765|43210/);
 });
 it('has no message button when the contact is not a link',()=>{expect(eventValues({...ev,contact:'Ask at the desk'},undefined,undefined,'Info',()=>{},()=>{}).canMessage).toBe(false);});
});
import {callHref} from './contact';
describe('listed-only events (audit 19 Nov)',()=>{
 const listed={slug:'s',name:'November Open',club:'Banyan',startDate:'2026-11-28',startTime:'08:00',status:'draft',registrationOpen:false,listing:'listed',contact:'98765 43210',divisions:[{id:'d',name:'Open',kind:'doubles',rules:{},taken:0}]} as unknown as PublicEvent;
 it('never says Entries closed; offers WhatsApp and Call to the organiser',()=>{
  expect(primaryAction(listed)).toEqual({label:'WhatsApp the organiser',to:'contact'});
  const v=eventValues(listed,undefined,undefined,'Entries',()=>{},()=>{});
  expect(v.statusLabel).toBe('Enter with the organiser');
  expect(v.entryLine).toBe('Enter with the organiser');
  expect(v.canMessage).toBe(true);expect(v.messageLabel).toBe('Call the organiser');
  expect(JSON.stringify(v)).not.toMatch(/Entries closed|teams entered/);
 });
 it('hides the empty entry bar for listed events and never shows a full bar without a cap',()=>{
  expect(eventValues(listed,undefined,undefined,'Entries',()=>{},()=>{}).showFill).toBe(false);
  const run={...listed,listing:'run'} as PublicEvent;const v=eventValues(run,undefined,undefined,'Entries',()=>{},()=>{});
  expect(v.showFill).toBe(true);expect(v.hasCap).toBe(false);expect(v.pct).toBe('0%');
 });
 it('without a usable number it still says Enter with the organiser, with no button to press',()=>{
  expect(primaryAction({...listed,contact:'Ask at the desk'})).toEqual({label:'Enter with the organiser',to:null});
 });
 it('a finished listed event shows its results',()=>{expect(primaryAction({...listed,status:'done'}).to).toBe('results');});
 it('builds call links from phone numbers only',()=>{
  expect(callHref('WhatsApp 98765 43210')).toBe('tel:+919876543210');
  expect(callHref('desk@club.test')).toBeNull();expect(callHref('https://club.test')).toBeNull();
 });
});
