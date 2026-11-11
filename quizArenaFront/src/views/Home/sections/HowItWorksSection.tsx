import Icon from '../../../components/ui/Icon/Icon';
import SectionHeading from '../../../components/ui/SectionHeading/SectionHeading';
import type { HowItWorksStep } from '../../../models/landing';

interface HowItWorksSectionProps {
    id: string;
    steps: HowItWorksStep[];
}

export default function HowItWorksSection({ id, steps }: HowItWorksSectionProps) {
    const titleId = `${id}-titulo`;

    return (
        <section id={id} className="home-section" aria-labelledby={titleId}>
            <div className="container">
                <SectionHeading
                    id={titleId}
                    eyebrow="Como funciona"
                    title="Do quiz à partida em quatro passos"
                    description="Um fluxo simples, pensado para a sala de aula."
                />

                <ol className="home-steps">
                    {steps.map((step, index) => (
                        <li key={step.title} className="home-steps__item">
                            <div className="home-steps__icon">
                                <Icon name={step.icon} size={22} />
                                <span className="home-steps__number">{index + 1}</span>
                            </div>
                            <h3 className="home-steps__title">{step.title}</h3>
                            <p className="home-steps__description">{step.description}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
