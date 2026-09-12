import { ChevronDown } from "lucide-react";
import { Section, SectionHead } from "@/components/landing/section";

const FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "O que conta como cabeça no plano?",
    answer:
      "Só os animais ativos do rebanho. Vendidos, mortos e perdidos ficam no histórico e não contam no limite.",
  },
  {
    question: "Funciona no celular, no campo?",
    answer:
      "Sim. Abre no navegador do celular, sem instalar app. O brete, as pesagens e o registro de nascimento foram feitos para o polegar.",
  },
  {
    question: "Consigo trazer minha planilha?",
    answer:
      "Consegue. A importação lê a planilha que você já usa: brinco, categoria, raça, nascimento, lote e última pesagem. Se faltar algo, o sistema avisa antes de gravar.",
  },
  {
    question: "E se eu passar do limite de cabeças?",
    answer:
      "Nada some. Você continua vendo e manejando o rebanho inteiro; para cadastrar animais além do limite é só subir de plano, na hora.",
  },
  {
    question: "Posso cancelar?",
    answer:
      "Quando quiser, nas configurações. E nos primeiros 30 dias, se não viu valor, devolvemos o que pagou.",
  },
];

export function Faq() {
  return (
    <Section id="perguntas" band className="grid gap-8 md:grid-cols-3">
      <SectionHead eyebrow="Perguntas" title="O que perguntam antes de assinar" align="start" />
      <ul className="flex flex-col border-b border-hairline md:col-span-2">
        {FAQ.map(({ question, answer }) => (
          <li key={question} className="border-t border-hairline">
            <details className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDown
                  className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="max-w-2xl pb-3 text-sm leading-[22px] text-ink-soft">{answer}</p>
            </details>
          </li>
        ))}
      </ul>
    </Section>
  );
}
