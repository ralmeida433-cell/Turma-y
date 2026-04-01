export interface MilitaryMember {
  id: number;
  re: string;
  name: string;
  warName: string;
  role: string;
  code: string;
  phone?: string;
}

export interface Turma {
  id: string;
  name: string;
  members: MilitaryMember[];
}

export const TURMAS: Record<string, Turma> = {
  Y: {
    id: 'Y',
    name: 'Turma Y',
    members: [
      { id: 1, re: "", name: "", warName: "", role: "", code: "1201" },
      { id: 2, re: "1577220", name: "ANDRE LUIZ CANDIDO", warName: "ANDRE LUIZ", role: "", code: "1202", phone: "31991810498" },
      { id: 3, re: "1593615", name: "BRUNO EDUARDO ABRAO", warName: "ABRAO", role: "", code: "1203", phone: "31996653096" },
      { id: 4, re: "1583780", name: "CHRISTHOFER MILITAO DA SILVA", warName: "CHRISTHOFER", role: "", code: "1204", phone: "31980159719" },
      { id: 5, re: "1572924", name: "DANIEL FERNANDES ALVES PINTO", warName: "DANIEL", role: "", code: "1205", phone: "31989902774" },
      { id: 6, re: "1599562", name: "DANIELY APARECIDA DE ALCANTARA SILVA", warName: "DANIELY", role: "", code: "1206", phone: "31975579617" },
      { id: 7, re: "1585546", name: "DENIS FARLEI MENDES DA ROCHA", warName: "DENIS", role: "", code: "1207" },
      { id: 8, re: "1585215", name: "DOUGLAS FERNANDES DAS DORES", warName: "DOUGLAS", role: "", code: "1208", phone: "31988104050" },
      { id: 9, re: "1598465", name: "EVERSON HENRIQUE DE SOUZA MOREIRA - CAT D", warName: "EVERSON", role: "", code: "1209" },
      { id: 10, re: "1560630", name: "FERNANDO CESAR VASCONCELOS DA CONCEICAO", warName: "FERNANDO", role: "", code: "1210" },
      { id: 11, re: "1587583", name: "FREDERICO AUGUSTO MACIEL GOMES DA SILVA", warName: "FREDERICO", role: "", code: "1211" },
      { id: 12, re: "1576586", name: "GUILHERME LUIZ SILVA MEIRELES", warName: "GUILHERME", role: "", code: "1212" },
      { id: 13, re: "1440718", name: "HUGO VIEIRA GODOY", warName: "GODOY", role: "", code: "1213" },
      { id: 14, re: "1593052", name: "JAMIL BATISTA DE SOUZA", warName: "JAMIL", role: "", code: "1214" },
      { id: 15, re: "1595545", name: "JILLIARD ARANTES MORAIS", warName: "JILLIARD", role: "", code: "1215", phone: "31992141963" },
      { id: 16, re: "1562735", name: "LEANDRO EDUARDO DA COSTA", warName: "LEANDRO", role: "", code: "1216", phone: "31989080028" },
      { id: 17, re: "1585769", name: "LUCIANO RODRIGO SIQUEIRA", warName: "SIQUEIRA", role: "", code: "1217", phone: "31988651299" },
      { id: 18, re: "1590926", name: "MICHEL DA SILVA SALES - CAT D", warName: "MICHEL", role: "", code: "1218", phone: "31986275932" },
      { id: 19, re: "1590371", name: "PABLO ANDRE MIQUELAO ALVES", warName: "PABLO", role: "", code: "1219" },
      { id: 20, re: "1598820", name: "POLIANA MICHELLE DE SOUZA REBELLO", warName: "POLIANA", role: "", code: "1220" },
      { id: 21, re: "1592369", name: "PRISCILA SUELEN PIRES GARCIA", warName: "SUELEN", role: "", code: "1221", phone: "31973405726" },
      { id: 22, re: "1589688", name: "RAFAEL ALMEIDA DE ARAUJO", warName: "RAFAEL", role: "", code: "1222", phone: "31992993437" },
      { id: 23, re: "1579309", name: "RAFAELA RODRIGUES FERREIRA LINARI", warName: "RAFAELA", role: "", code: "1223" },
      { id: 24, re: "1561893", name: "RAMON SANCHES DO NASCIMENTO", warName: "RAMON", role: "", code: "1224", phone: "31995670816" },
      { id: 25, re: "1575364", name: "RENATO VINICIUS ALVES VIANA - CAT D", warName: "RENATO", role: "", code: "1225", phone: "31973571015" },
      { id: 26, re: "1562099", name: "RODRIGO FELIPE BRUNO", warName: "RODRIGO", role: "", code: "1226" },
      { id: 27, re: "1484898", name: "SANDOCKAN FREITAS", warName: "SANDOCKAN", role: "", code: "1227", phone: "31994427333" },
      { id: 28, re: "1590702", name: "VALDEMILSON DE BRITO NASCIMENTO", warName: "VALDEMILSON", role: "", code: "1228", phone: "31997767891" },
    ]
  },
};
