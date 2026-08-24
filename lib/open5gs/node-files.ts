export type NodeFile = { node:string; kind:"config"|"logs"; path:string; available:boolean; content:string; modifiedAt:number|null };

const unavailable=(node:string,kind:NodeFile["kind"],path:string):NodeFile=>({node,kind,path,available:false,content:"",modifiedAt:null});

export async function getNodeFile(node:string,kind:NodeFile["kind"],path:string):Promise<NodeFile>{
  const agentUrl=process.env.OPEN5GS_AGENT_URL?.replace(/\/$/,"");
  const token=process.env.OPEN5GS_AGENT_TOKEN;
  if(!agentUrl||!token)return unavailable(node,kind,path);
  try{
    const response=await fetch(`${agentUrl}/v1/nodes/${encodeURIComponent(node)}/${kind}`,{headers:{Accept:"application/json",Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(3000)});
    if(!response.ok)return unavailable(node,kind,path);
    const value=await response.json() as Partial<NodeFile>;
    if(value.node!==node||value.kind!==kind||typeof value.content!=="string")return unavailable(node,kind,path);
    return {...unavailable(node,kind,path),...value};
  }catch{return unavailable(node,kind,path)}
}
