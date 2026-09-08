function __hashId(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);}return 'u'+(h>>>0).toString(36);}

var __pendingUserKey = '';

function __applyUserKey(key){
    if(!key)return;
    if(!window.chatbot){ __pendingUserKey = key; return; }
    window.chatbot.mwKeyApplied=true;
    var memberKey='';
    if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(key)){
        try{ memberKey=__hashId(String(key).trim().toLowerCase()); }catch(_){ memberKey=''; }
    }
    if(memberKey){
        window.chatbot.currentMemberId=memberKey;
        if(typeof window.chatbot.preloadRemoteQuotaForId==='function'){
            try{ window.chatbot.preloadRemoteQuotaForId(memberKey); }catch(_){ }
        }
    }
}

// chat.js calls this right after it publishes window.chatbot, so an identity that
// resolves before the chatbot exists is not silently dropped.
window.__drainPendingUserKey = function(){
    if(!__pendingUserKey) return;
    var key = __pendingUserKey;
    __pendingUserKey = '';
    __applyUserKey(key);
};

document.addEventListener('DOMContentLoaded',function(){
	var ctr=document.getElementById('SFctr');
	if(!ctr){ return; }

	var EMAIL_RX=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

	// Ordered cheapest-first: one text pass, then mailto links, then the
	// attributes that realistically carry an address.
	function scanCheap(root){
		var tMatch=(root.textContent||'').match(EMAIL_RX);
		if(tMatch) return tMatch[0];

		var anchors=root.querySelectorAll('a[href^="mailto:"]');
		for(var i=0;i<anchors.length;i++){
			var hm=(anchors[i].getAttribute('href')||'').replace(/^mailto:/i,'').match(EMAIL_RX);
			if(hm) return hm[0];
		}

		var fields=root.querySelectorAll('input,textarea,[value],[data-email],[title],[alt],[placeholder]');
		for(var j=0;j<fields.length;j++){
			var el=fields[j];
			var candidates=[
				typeof el.value==='string'?el.value:'',
				el.getAttribute('value')||'',
				el.getAttribute('data-email')||'',
				el.getAttribute('title')||'',
				el.getAttribute('alt')||'',
				el.getAttribute('placeholder')||''
			];
			for(var k=0;k<candidates.length;k++){
				if(!candidates[k]) continue;
				var cm=candidates[k].match(EMAIL_RX);
				if(cm) return cm[0];
			}
		}
		return '';
	}

	// Every element x every attribute. Capped at MAX_DEEP_SCANS because this is
	// what used to run on each individual mutation.
	function scanDeep(root){
		var all=root.querySelectorAll('*');
		for(var i=0;i<all.length;i++){
			var attrs=all[i].attributes;
			for(var j=0;j<attrs.length;j++){
				var m=(attrs[j].value||'').match(EMAIL_RX);
				if(m) return m[0];
			}
		}
		return '';
	}

	var MAX_DEEP_SCANS=3;
	var SETTLE_MS=120;
	var GIVE_UP_MS=20000;
	var deepScans=0;
	var finished=false;
	var settleTimer=null;
	var giveUpTimer=null;
	var obs=null;

	function finish(){
		if(finished) return;
		finished=true;
		if(obs) obs.disconnect();
		clearTimeout(settleTimer);
		clearTimeout(giveUpTimer);
	}

	function attempt(force){
		if(finished) return;
		var email=scanCheap(ctr);
		if(!email && (force || deepScans<MAX_DEEP_SCANS)){
			deepScans++;
			email=scanDeep(ctr);
		}
		if(email){
			__applyUserKey(email);
			finish();
		}
	}

	// Coalesce a burst of widget mutations into a single scan.
	function schedule(){
		if(finished) return;
		clearTimeout(settleTimer);
		settleTimer=setTimeout(attempt,SETTLE_MS);
	}

	obs=new MutationObserver(schedule);
	obs.observe(ctr,{childList:true,subtree:true});

	// The widget may have rendered before this listener ran.
	attempt();

	// One last full scan against the settled DOM, then never leave the observer
	// attached indefinitely for logged-out visitors.
	giveUpTimer=setTimeout(function(){
		attempt(true);
		finish();
	},GIVE_UP_MS);
});
