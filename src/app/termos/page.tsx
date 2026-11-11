import { LegalNotice } from "@/components/ata-bits";
import { LegalPage } from "../legal";

export const metadata = { title: "Termos de uso" };

export default function Terms() {
  return (
    <LegalPage title="Termos de Uso" updated="11/2026">
      <h2>1. Objeto</h2>
      <p>A plataforma é um marketplace de descoberta, exposição e conexão comercial relacionado a Atas de Registro de Preços. Não substitui, intermedeia ou autoriza os procedimentos administrativos e jurídicos de adesão, que são de responsabilidade exclusiva de cada órgão interessado, do órgão gerenciador e do fornecedor.</p>
      <LegalNotice />
      <h2>2. Natureza das informações</h2>
      <ul>
        <li>Dados importados de fontes públicas (como o PNCP) são reproduzidos com indicação de fonte, URL e data de coleta, podendo conter divergências da origem.</li>
        <li>Atas cadastradas por fornecedores são declaradas pelo próprio fornecedor e passam por moderação; o status de validação indica o nível de conferência realizado.</li>
        <li>Quantidades registradas não equivalem a saldo disponível. A plataforma não garante saldo, vigência, aptidão para adesão ou disponibilidade comercial sem confirmação específica.</li>
        <li>Indicadores de conferência do art. 86 da Lei 14.133/2021 são auxiliares e não constituem parecer jurídico.</li>
      </ul>
      <h2>3. Contas e responsabilidades</h2>
      <ul>
        <li>O usuário declara possuir poderes para representar a organização cadastrada e responde pela veracidade das informações.</li>
        <li>Fornecedores devem cadastrar apenas atas das quais sejam titulares ou representantes autorizados, mediante evidência quando solicitado.</li>
        <li>Solicitações de informação e manifestações de interesse não constituem adesão, autorização ou compromisso de contratação.</li>
        <li>É vedado o uso automatizado abusivo, a coleta massiva de dados da plataforma e qualquer tentativa de burlar controles de acesso.</li>
      </ul>
      <h2>4. Planos e pagamentos</h2>
      <p>Planos de fornecedores são mensais e renováveis; licenças de órgãos são anuais e contratadas segundo os procedimentos aplicáveis ao contratante. Não há cobrança de comissão sobre o valor de adesões.</p>
      <h2>5. Moderação</h2>
      <p>A plataforma pode recusar, despublicar ou corrigir registros com indícios de erro, duplicidade ou irregularidade, mantendo histórico das alterações.</p>
      <h2>6. Foro e legislação</h2>
      <p>Aplica-se a legislação brasileira, incluindo a Lei 14.133/2021, a Lei 13.709/2018 (LGPD) e o Marco Civil da Internet (Lei 12.965/2014).</p>
    </LegalPage>
  );
}
