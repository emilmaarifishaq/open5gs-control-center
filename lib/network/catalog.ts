export type CoreType = "epc" | "5gc";
export type NetworkNode = { slug:string; name:string; fullName:string; core:CoreType; layer:"access"|"control"|"data"|"service"; role:string; description:string; service?:string; config?:string; log?:string; interfaces:string[]; peers:string[] };

const n = (slug:string,name:string,fullName:string,core:CoreType,layer:NetworkNode["layer"],role:string,interfaces:string[],peers:string[],service?:string):NetworkNode => ({slug,name,fullName,core,layer,role,interfaces,peers,service,config:service?`/etc/open5gs/${service.replace(/^open5gs-/,"").replace(/d$/,"")}.yaml`:undefined,description:`${fullName} provides ${role.toLowerCase()} for the ${core === "epc" ? "EPC/LTE" : "5G Core"} network.`});
export const nodes:NetworkNode[] = [
 n("mme","MME","Mobility Management Entity","epc","control","Mobility & attach control",["S1-MME","S6a","S11"],["enb","hss","sgwc"],"open5gs-mmed"),
 n("hss","HSS","Home Subscriber Server","epc","service","Subscriber & authentication",["S6a","Cx"],["mme","pcrf"],"open5gs-hssd"),
 n("pcrf","PCRF","Policy and Charging Rules Function","epc","service","Policy & charging",["Gx","Rx"],["spgwc"],"open5gs-pcrfd"),
 n("sgwc","SGW-C","Serving Gateway Control Plane","epc","control","Serving gateway control",["S11","S5-C","PFCP"],["mme","sgwu","spgwc"],"open5gs-sgwcd"),
 n("sgwu","SGW-U","Serving Gateway User Plane","epc","data","Serving gateway traffic",["S1-U","S5-U","PFCP"],["enb","sgwc","upf"],"open5gs-sgwud"),
 n("spgwc","S/PGW-C","Serving / Packet Gateway Control","epc","control","Packet gateway control",["S5-C","Gx","PFCP"],["sgwc","pcrf","upf"],"open5gs-smfd"),
 n("enb","eNB","E-UTRAN Node B","epc","access","LTE radio access",["Uu","S1-MME","S1-U"],["ue-lte","mme","sgwu"]),
 n("ue-lte","UE","LTE User Equipment","epc","access","Subscriber device",["Uu"],["enb"]),
 n("amf","AMF","Access and Mobility Management Function","5gc","control","Access & mobility",["N1","N2","Namf"],["gnb","ausf","smf","nrf"],"open5gs-amfd"),
 n("smf","SMF","Session Management Function","5gc","control","PDU session control",["N4","Nsmf","N7"],["amf","upf","pcf","nrf"],"open5gs-smfd"),
 n("upf","UPF","User Plane Function","5gc","data","User plane forwarding",["N3","N4","N6","N9"],["gnb","smf","dn"],"open5gs-upfd"),
 n("nrf","NRF","Network Repository Function","5gc","service","NF discovery",["Nnrf"],["amf","smf","ausf","udm","pcf","nssf"],"open5gs-nrfd"),
 n("ausf","AUSF","Authentication Server Function","5gc","service","5G authentication",["Nausf","N13"],["amf","udm","nrf"],"open5gs-ausfd"),
 n("udm","UDM","Unified Data Management","5gc","service","Subscriber data",["Nudm","N8","N10","N13"],["ausf","amf","smf","udr"],"open5gs-udmd"),
 n("udr","UDR","Unified Data Repository","5gc","service","Structured data store",["Nudr"],["udm","pcf"],"open5gs-udrd"),
 n("pcf","PCF","Policy Control Function","5gc","service","Policy control",["Npcf","N7","N15"],["smf","amf","udr"],"open5gs-pcfd"),
 n("nssf","NSSF","Network Slice Selection Function","5gc","service","Slice selection",["Nnssf","N22"],["amf","nrf"],"open5gs-nssfd"),
 n("bsf","BSF","Binding Support Function","5gc","service","Session binding",["Nbsf"],["pcf","nrf"],"open5gs-bsfd"),
 n("scp","SCP","Service Communication Proxy","5gc","service","Service routing proxy",["SBI"],["nrf","amf","smf"],"open5gs-scpd"),
 n("sepp","SEPP","Security Edge Protection Proxy","5gc","service","Inter-PLMN security",["N32"],["nrf","scp"],"open5gs-seppd"),
 {slug:"gnb",name:"UERANSIM gNB",fullName:"UERANSIM gNodeB",core:"5gc",layer:"access",role:"Simulated 5G radio access",interfaces:["Uu (simulated)","N2 / NGAP","N3 / GTP-U"],peers:["ue-5g","amf","upf"],service:"ueransim-gnb",config:"/opt/UERANSIM/config/open5gs-gnb.yaml",log:"journalctl -u ueransim-gnb",description:"UERANSIM gNodeB simulates 5G SA radio access and connects the UE to the AMF over N2 and the UPF over N3."},
 {slug:"ue-5g",name:"UERANSIM UE",fullName:"UERANSIM User Equipment",core:"5gc",layer:"access",role:"Simulated 5G subscriber device",interfaces:["Uu (simulated)","N1 / NAS"],peers:["gnb","amf"],service:"ueransim-ue",config:"/opt/UERANSIM/config/open5gs-ue.yaml",log:"journalctl -u ueransim-ue",description:"UERANSIM UE simulates a 5G SA subscriber device for registration, authentication, and PDU session testing."},
 n("dn","DN","Data Network","5gc","data","External data network",["N6"],["upf"]),
];
export const getNode=(slug:string)=>nodes.find(x=>x.slug===slug);
export const getCoreNodes=(core:CoreType)=>nodes.filter(x=>x.core===core);
