import {describe,expect,it} from 'vitest';
import {personalise,SIGNED_OUT} from './useHome';

const page='<header><a class="tlink" href="Overview.dc.html">Sign in</a></header><nav class="mpanel" aria-label="Menu"><a href="Live.dc.html">Live scores</a><a href="Studio.dc.html">Player Studio</a><a href="Overview.dc.html">For clubs</a><a href="Overview.dc.html">Sign in</a></nav><a href="Overview.dc.html">Organiser home →</a>';

describe('prototype page header follows who is signed in',()=>{
  it('signed out: Sign in goes to the sign-in page, For clubs stays',()=>{
    const s=personalise(page,SIGNED_OUT);
    expect(s).toContain('href="Account.dc.html">Sign in<');
    expect(s).toContain('>For clubs<');
  });
  it('a signed-in organiser gets My clubs and My entries, and other Organiser links are untouched',()=>{
    const s=personalise(page,{signedIn:true,route:'club',staff:true});
    expect(s).not.toContain('>Sign in<');
    expect(s).not.toContain('>For clubs<');
    expect(s).toContain('>My entries</a>');
    expect(s.match(/>My clubs</g)).toHaveLength(2);
    expect(s).toContain('href="Overview.dc.html">Organiser home →');
  });
  it('a signed-in player gets My Studio in the header only, so the phone menu does not list the Studio twice',()=>{
    const s=personalise(page,{signedIn:true,route:'club-player-studio',staff:false});
    expect(s.match(/My Studio/g)).toHaveLength(1);
    expect(s).toContain('>My entries</a>');
  });
});
