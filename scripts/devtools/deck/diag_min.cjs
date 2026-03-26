const W=require('ws'),T=process.argv[2],w=new W('ws://127.0.0.1:8081/devtools/page/'+T);
w.on('open',()=>{
  w.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'JSON.stringify({fnc:!!window.FocusNavController,dfl:!!window.DFL,store:!!window.appStore})',returnByValue:true}}));
});
w.on('message',(raw)=>{
  const m=JSON.parse(raw.toString());
  if(m.id===1){process.stdout.write((m.result?.result?.value||JSON.stringify(m.result))+'\n');w.close();}
});
setTimeout(()=>{process.stderr.write('TIMEOUT\n');process.exit(1);},8000);
