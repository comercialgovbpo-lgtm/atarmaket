import Link from "next/link";
import { LegalPage } from "../legal";

export const metadata = { title: "Política de privacidade" };

export default function Privacy() {
  return (
    <LegalPage title="Política de Privacidade" updated="11/2026">
      <h2>1. Dados tratados</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail, telefone, cargo e vínculo com a organização (execução de contrato e procedimentos preliminares — art. 7º, V).</li>
        <li><strong>Uso:</strong> pesquisas, favoritos, alertas e solicitações, para prestação do serviço e histórico solicitado pelo usuário.</li>
        <li><strong>Segurança:</strong> registros de acesso e auditoria (art. 15 do Marco Civil; legítimo interesse — art. 7º, IX).</li>
        <li><strong>Dados públicos:</strong> informações de atas e contratações divulgadas em portais oficiais (art. 7º, §§3º e 4º), com indicação de fonte. CPF de pessoas físicas fornecedoras não é exibido.</li>
        <li><strong>Comunicações comerciais:</strong> somente mediante consentimento, revogável a qualquer tempo.</li>
      </ul>
      <h2>2. Compartilhamento</h2>
      <p>Ao enviar uma solicitação a um fornecedor, os dados de contato informados no formulário são compartilhados com esse fornecedor. Contatos de fornecedores só são exibidos publicamente com autorização expressa. Operadores contratados (hospedagem, banco de dados, armazenamento, e-mail, pagamentos e IA para extração de documentos) tratam dados conforme instruções e contratos.</p>
      <h2>3. Documentos</h2>
      <p>Documentos enviados são armazenados em ambiente privado e entregues somente a usuários autorizados. Evidências de titularidade nunca são públicas. Documentos de atas são públicos apenas após a publicação da ata.</p>
      <h2>4. Segurança</h2>
      <p>Senhas com hash bcrypt, sessões com cookie HttpOnly, controle de acesso por perfil e por linha no banco de dados (RLS), limites de requisição e registros de auditoria.</p>
      <h2>5. Direitos do titular</h2>
      <p>Confirmação, acesso, correção, anonimização, portabilidade, eliminação e revogação de consentimento (art. 18). Usuários autenticados podem baixar seus dados e excluir a conta em <Link href="/conta" className="text-brand-700 underline">Minha conta</Link>; demais solicitações em <Link href="/lgpd" className="text-brand-700 underline">Direitos do titular</Link>.</p>
      <h2>6. Retenção</h2>
      <p>Dados de conta são mantidos enquanto ativa; após exclusão, são anonimizados, preservando registros necessários a obrigações legais e à defesa em processos.</p>
      <h2>7. Encarregado (DPO)</h2>
      <p>Contato do encarregado a ser publicado pela operadora da plataforma (variável de configuração institucional).</p>
    </LegalPage>
  );
}
