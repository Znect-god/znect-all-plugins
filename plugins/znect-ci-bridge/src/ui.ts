export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Znect CI Bridge</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e8eaf0;background:#11141b;font-synthesis:none}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at top,#202b3a,#11141b 58%);color:#e8eaf0}
main{width:min(960px,100%);margin:0 auto;padding:28px 18px 56px}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}
h1{font-size:clamp(1.5rem,4vw,2.1rem);margin:0;letter-spacing:-.04em}
.sub{color:#9ca8ba;margin:6px 0 0;font-size:.92rem}
.panel{background:#1a202b;border:1px solid #303a49;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 12px 30px #0002}
label{display:block;font-size:.88rem;color:#bdc7d6;margin-bottom:8px}
input{width:100%;padding:13px 14px;border:1px solid #465367;border-radius:10px;background:#10151e;color:#fff;font:inherit}select{padding:10px 12px;border:1px solid #465367;border-radius:10px;background:#10151e;color:#fff;font:inherit;min-width:180px}
button{border:1px solid #52647d;border-radius:10px;padding:10px 14px;background:#29384c;color:#fff;font:inherit;cursor:pointer}
button:hover{background:#344a65}button:disabled{opacity:.5;cursor:wait}
.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
.status{font-size:.9rem;color:#aab6c7;min-height:1.4em}.error{color:#ff9d9d}.good{color:#9de2b4}
.run{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-top:1px solid #303a49}
.run:first-child{border-top:0}.run-main{min-width:0}.run-title{font-weight:650;overflow-wrap:anywhere}.meta{color:#9ca8ba;font-size:.85rem;margin-top:4px}
.pill{font-size:.75rem;border:1px solid #53657d;border-radius:999px;padding:4px 9px;white-space:nowrap}
.workflow{border-top:1px solid #303a49;padding:12px 0}.workflow h3{font-size:1rem;margin:0 0 8px}
.job{display:flex;justify-content:space-between;gap:10px;padding:7px 0;color:#c5ceda;font-size:.9rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#0d1118;border:1px solid #303a49;border-radius:10px;padding:12px;font-size:.8rem}
.small{font-size:.8rem;color:#9ca8ba}a{color:#9cc8ff}
@media(max-width:560px){main{padding:20px 12px 40px}.panel{padding:14px}.run{align-items:flex-start}.pill{margin-top:2px}}
</style>
</head>
<body>
<main>
<header><div><h1>Znect CI Bridge</h1><p class="sub">Read-only CircleCI dashboard · registered Znect projects</p></div><span class="pill">FREE WEB ACCESS</span></header>
<section class="panel" aria-labelledby="access-title">
<h2 id="access-title" style="font-size:1.05rem;margin:0 0 12px">Secure access</h2>
<label for="token">Web access token</label>
<input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Enter your Web access token">
<div class="actions"><button id="connect">Connect</button><button id="disconnect" type="button">Clear token</button></div>
<p id="message" class="status" role="status" aria-live="polite">Your web token stays in this tab's memory and is not saved to browser storage.</p>
</section>
<section class="panel" id="runs-panel" hidden>
<div class="actions" style="justify-content:space-between;margin-top:0"><h2 style="font-size:1.05rem;margin:0">Recent runs</h2><button id="refresh">Refresh</button></div>
<div class="actions"><label for="project" style="margin:0">Project</label><select id="project" aria-label="Select Znect project"></select><label for="connection" style="margin:0">CI connection</label><select id="connection" aria-label="Select CircleCI connection"></select></div>
<div id="runs" style="margin-top:12px"></div>
</section>
<section class="panel" id="events-panel" hidden>
<div class="actions" style="justify-content:space-between;margin-top:0"><h2 style="font-size:1.05rem;margin:0">Recent webhook events</h2><button id="refresh-events" type="button">Refresh events</button></div>
<div id="events" style="margin-top:12px"></div>
</section>
<section class="panel" id="details-panel" hidden>
<div class="actions" style="justify-content:space-between;margin-top:0"><h2 style="font-size:1.05rem;margin:0">Run details</h2><button id="copy">Copy JSON</button></div>
<div id="details"></div>
<details style="margin-top:12px"><summary>Raw response</summary><pre id="raw"></pre></details>
</section>
<p class="small">Read-only service. This dashboard cannot start, retry, cancel, modify, or deploy pipelines. CircleCI credentials remain on the server.</p>
</main>
<script>
(function(){
  "use strict";
  var token="";
  var currentProject="";
  var currentConnection="";
  var lastDetails=null;
  var sessionVersion=0;
  var runsRequestId=0;
  var detailsRequestId=0;
  var eventsRequestId=0;
  var tokenInput=document.getElementById("token");
  var projectSelect=document.getElementById("project");
  var connectionSelect=document.getElementById("connection");
  var registeredProjects=[];
  var message=document.getElementById("message");
  var runsPanel=document.getElementById("runs-panel");
  var detailsPanel=document.getElementById("details-panel");
  var eventsPanel=document.getElementById("events-panel");
  var runsBox=document.getElementById("runs");
  var detailsBox=document.getElementById("details");
  var eventsBox=document.getElementById("events");
  var rawBox=document.getElementById("raw");
  function setMessage(text,kind){message.textContent=text;message.className="status "+(kind||"");}
  function element(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
  function request(path){
    return fetch(path,{method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json"},cache:"no-store",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer"}).then(function(response){
      if(response.status===401)throw new Error("Access denied. Check the Bridge token.");
      return response.json().then(function(data){if(!response.ok)throw new Error(data.error||("Request failed: "+response.status));return data;});
    });
  }
  function scopeQuery(){return "project_id="+encodeURIComponent(currentProject)+"&connection_id="+encodeURIComponent(currentConnection);}
  function selectProject(projectId){
    currentProject=projectId;
    var project=registeredProjects.find(function(item){return item.id===projectId;});
    var connections=(project&&Array.isArray(project.connections)?project.connections:[]).filter(function(item){return item.provider==="circleci";});
    connectionSelect.replaceChildren();
    connections.forEach(function(connection){
      var option=element("option","",connection.id);
      option.value=connection.id;
      connectionSelect.appendChild(option);
    });
    currentConnection=connections.length?connections[0].id:"";
    connectionSelect.value=currentConnection;
    connectionSelect.disabled=connections.length<2;
  }
  function connect(){
    var version=++sessionVersion;
    runsRequestId++;detailsRequestId++;eventsRequestId++;
    token=tokenInput.value.trim();
    runsPanel.hidden=true;detailsPanel.hidden=true;eventsPanel.hidden=true;lastDetails=null;
    runsBox.replaceChildren();detailsBox.replaceChildren();eventsBox.replaceChildren();rawBox.textContent="";
    if(!token){setMessage("Enter the Bridge access token.","error");return;}
    setMessage("Loading registered projects…");
    request("/api/v1/projects").then(function(data){
      if(version!==sessionVersion)return;
      registeredProjects=(Array.isArray(data.projects)?data.projects:[]).filter(function(project){
        return Array.isArray(project.connections)&&project.connections.some(function(connection){return connection.provider==="circleci";});
      });
      projectSelect.replaceChildren();
      registeredProjects.forEach(function(project){
        var option=element("option","",project.name);
        option.value=project.id;
        projectSelect.appendChild(option);
      });
      if(!registeredProjects.length)throw new Error("No registered project has a CircleCI connection.");
      var firstProject=registeredProjects.some(function(project){return project.id==="znect-forge";})?"znect-forge":registeredProjects[0].id;
      selectProject(firstProject);
      projectSelect.value=currentProject;
      return request("/api/v1/status?"+scopeQuery());
    }).then(function(data){
      if(version!==sessionVersion)return;
      if(data.provider_availability==="available"){
        setMessage("Connected to "+(data.project.name||"CircleCI project")+" via "+(data.connection.id||"selected connection")+". Read-only access confirmed.","good");
        runsPanel.hidden=false;eventsPanel.hidden=false;
        loadRuns();loadEventCorrelations();
      }else{
        setMessage("Project and connection are configured, but the CircleCI provider is currently unavailable.","error");
        runsPanel.hidden=false;eventsPanel.hidden=false;
        runsBox.replaceChildren(element("p","status error",data.error||"Provider availability could not be confirmed."));
        eventsBox.replaceChildren(element("p","status error","CircleCI must be reachable to correlate webhook events."));
      }
    }).catch(function(error){
      if(version!==sessionVersion)return;
      token="";tokenInput.value="";setMessage(error.message,"error");
    });
  }
  function loadRuns(){
    if(!token)return;
    var version=sessionVersion;
    var requestId=++runsRequestId;
    runsBox.replaceChildren(element("p","status","Loading runs…"));
    request("/api/v1/runs?limit=20&"+scopeQuery()).then(function(data){
      if(version!==sessionVersion||requestId!==runsRequestId)return;
      runsBox.replaceChildren();
      var items=Array.isArray(data.runs)?data.runs:[];
      if(!items.length){runsBox.appendChild(element("p","status","No recent runs were returned."));return;}
      items.forEach(function(run){
                var row=element("div","run");
        var main=element("div","run-main");
        var title=run.commitMessage||run.branch||run.commitSha||run.id;
        main.appendChild(element("div","run-title",title));
        main.appendChild(element("div","meta","Run "+run.id+" · "+(run.startedAt||"date unavailable")));
        var button=element("button","","Open");
        button.type="button";
        button.addEventListener("click",function(){loadDetails(run.id);});
        row.appendChild(main);row.appendChild(button);row.appendChild(element("span","pill",run.status||"unknown"));
        runsBox.appendChild(row);
      });
    }).catch(function(error){
      if(version!==sessionVersion||requestId!==runsRequestId)return;
      runsBox.replaceChildren(element("p","status error",error.message));
    });
  }
  function loadEventCorrelations(){
    if(!token||!currentProject||!currentConnection)return;
    var version=sessionVersion;
    var requestId=++eventsRequestId;
    eventsBox.replaceChildren(element("p","status","Loading webhook events…"));
    request("/api/v1/event-correlations?event_limit=20&run_limit=20&"+scopeQuery()).then(function(data){
      if(version!==sessionVersion||requestId!==eventsRequestId)return;
      eventsBox.replaceChildren();
      var items=Array.isArray(data.correlations)?data.correlations:[];
      if(!items.length){eventsBox.appendChild(element("p","status","No recent webhook events were returned."));return;}
      items.forEach(function(entry){
        var event=entry.event||{};
        var row=element("div","run");
        var main=element("div","run-main");
        main.appendChild(element("div","run-title",event.type||"CI event"));
        var metadata=[event.branch||"branch unavailable",event.revision?String(event.revision).slice(0,12):"revision unavailable",event.happened_at||"time unavailable"].join(" · ");
        main.appendChild(element("div","meta",metadata));
        if(Array.isArray(entry.candidates)&&entry.candidates.length){
          var candidateText=entry.candidates.map(function(candidate){
            var run=candidate.run||{};
            return "Run "+(run.id||"unknown")+" · "+(run.status||"unknown")+" · "+Math.round((candidate.time_delta_ms||0)/1000)+"s";
          }).join("; ");
          main.appendChild(element("div","meta",candidateText));
        }
        var status=entry.status==="candidate"?"Candidate":entry.status==="ambiguous"?"Ambiguous ("+((entry.candidates||[]).length)+")":"Unmatched";
        row.appendChild(main);
        row.appendChild(element("span","pill",status));
        eventsBox.appendChild(row);
      });
    }).catch(function(error){
      if(version!==sessionVersion||requestId!==eventsRequestId)return;
      eventsBox.replaceChildren(element("p","status error",error.message));
    });
  }

  function loadDetails(id){
    var version=sessionVersion;
    var requestId=++detailsRequestId;
    setMessage("Loading run details…");
    request("/api/v1/runs/"+encodeURIComponent(id)+"?"+scopeQuery()).then(function(data){
      if(version!==sessionVersion||requestId!==detailsRequestId)return;
      lastDetails=data;detailsPanel.hidden=false;detailsBox.replaceChildren();
      var run=data.run||{};      detailsBox.appendChild(element("p","meta","Run "+run.id+" · "+(run.status||"status unavailable")));
      (data.workflows||[]).forEach(function(entry){
        var workflow=entry.workflow||{};
        var section=element("section","workflow");
        section.appendChild(element("h3","",workflow.name||workflow.id||"Workflow"));
        (entry.jobs||[]).forEach(function(job){
                    var line=element("div","job");
          line.appendChild(element("span","",job.name||job.id));
          line.appendChild(element("span","pill",job.status||"unknown"));
          section.appendChild(line);
        });
        detailsBox.appendChild(section);
      });
      rawBox.textContent=JSON.stringify(data,null,2);
      detailsPanel.scrollIntoView({behavior:"smooth",block:"start"});
      setMessage("Run details loaded.","good");
    }).catch(function(error){
      if(version!==sessionVersion||requestId!==detailsRequestId)return;
      setMessage(error.message,"error");
    });
  }
  document.getElementById("connect").addEventListener("click",connect);
  document.getElementById("refresh").addEventListener("click",loadRuns);
  document.getElementById("refresh-events").addEventListener("click",loadEventCorrelations);
  function refreshSelectedScope(){
    eventsRequestId++;
    detailsPanel.hidden=true;lastDetails=null;rawBox.textContent="";
    setMessage("Switching CI connection…");
    request("/api/v1/status?"+scopeQuery()).then(function(data){
      if(data.provider_availability==="available"){
        setMessage("Connected to "+(data.project.name||"CircleCI project")+" via "+(data.connection.id||"selected connection")+".","good");
        loadRuns();loadEventCorrelations();
      }else{
        setMessage("Project and connection are configured, but the provider is unavailable.","error");
        runsBox.replaceChildren(element("p","status error",data.error||"Provider availability could not be confirmed."));
        eventsBox.replaceChildren(element("p","status error","CircleCI must be reachable to correlate webhook events."));
      }
    }).catch(function(error){
      eventsBox.replaceChildren(element("p","status error",error.message));
      setMessage(error.message,"error");
    });
  }
  projectSelect.addEventListener("change",function(){
    selectProject(projectSelect.value);
    refreshSelectedScope();
  });
  connectionSelect.addEventListener("change",function(){
    currentConnection=connectionSelect.value;
    refreshSelectedScope();
  });
  document.getElementById("disconnect").addEventListener("click",function(){
    sessionVersion++;runsRequestId++;detailsRequestId++;eventsRequestId++;
    token="";tokenInput.value="";runsPanel.hidden=true;detailsPanel.hidden=true;eventsPanel.hidden=true;lastDetails=null;
    runsBox.replaceChildren();detailsBox.replaceChildren();eventsBox.replaceChildren();rawBox.textContent="";
    setMessage("Token cleared from this tab.","");
  });
  document.getElementById("copy").addEventListener("click",function(){
    if(!lastDetails)return;
    var copiedDetails=lastDetails;
    var version=sessionVersion;
    navigator.clipboard.writeText(JSON.stringify(copiedDetails,null,2)).then(function(){
      if(version!==sessionVersion||lastDetails!==copiedDetails)return;
      setMessage("Run JSON copied.","good");
    }).catch(function(){
      if(version!==sessionVersion||lastDetails!==copiedDetails)return;
      setMessage("Clipboard access is unavailable in this browser.","error");
    });
  });
})();
</script>
</body>
</html>`;
