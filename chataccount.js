function __hashId(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);}return 'u'+(h>>>0).toString(36);} 
    function __applyUserKey(key){
    if(!key||!window.chatbot)return;
    window.chatbot.mwKeyApplied=true;
    var memberKey='';
    if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(key)){
        try{ memberKey=__hashId(String(key).trim().toLowerCase()); }catch(_){ memberKey=''; }
    }
    if(memberKey){
        window.chatbot.currentMemberId=memberKey;
        if(window.chatbot && typeof window.chatbot.preloadRemoteQuotaForId==='function'){
            try{ window.chatbot.preloadRemoteQuotaForId(memberKey); }catch(_){ }
        }
    }
}
document.addEventListener('DOMContentLoaded',function(){
	var ctr=document.getElementById('SFctr');
	if(!ctr){ return; }

	function __findIdentity(root){
		var email='';
		var emailRx=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
		var txt=(root.textContent||'');
		var tMatch=txt.match(emailRx); if(tMatch) email=tMatch[0];
		// mailto:
		if(!email){
			var anchors=Array.from(root.querySelectorAll('a[href^="mailto:"]'));
			var mailFromAnchor=anchors.map(a=>a.getAttribute('href')||'').map(h=>h.replace(/^mailto:/i,'')).find(Boolean)||'';
			if(emailRx.test(mailFromAnchor)) email=mailFromAnchor.match(emailRx)[0];
		}
		var all=Array.from(root.querySelectorAll('*'));
		for(var i=0;i<all.length && !email;i++){
			var el=all[i];
			var valAttr=(el.getAttribute && el.getAttribute('value'))||'';
			var valProp=(typeof el.value==='string'?el.value:'');
			var vm=(valProp||valAttr).match(emailRx); if(vm){ email=vm[0]; break; }
			for(var j=0;j<el.attributes.length && !email;j++){
				var a=el.attributes[j];
				var v=a.value||'';
				var m=v.match(emailRx); if(m){ email=m[0]; break; }
			}
		}
		return { email: email||'', elementCount: (root.querySelectorAll('*').length||0), textLen: (txt||'').length };
	}

    var obs=new MutationObserver(function(){
        var info=__findIdentity(ctr);
        var email=info.email;
        if(email){
            __applyUserKey(email);
            obs.disconnect();
        }
    });
	obs.observe(ctr,{childList:true,subtree:true});

});