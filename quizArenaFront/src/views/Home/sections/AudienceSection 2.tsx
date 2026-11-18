import FeatureCard from '../../../components/ui/FeatureCard/FeatureCard';
import Icon from '../../../components/ui/Icon/Icon';
import SectionHeading from '../../../components/ui/SectionHeading/SectionHeading';
import type { AudienceBenefits } from '../../../models/landing';

interface AudienceSectionProps {
    id: string;
    audiences: AudienceBenefits[];
}

export default function AudienceSection({ id, audiences }: AudienceSectionProps) {
    const titleId = `${id}-titulo`;

    return (
        <section id={id} className="home-section home-section--tinted" aria-labelledby={titleId}>
            <div className="container">
                <SectionHeading
                    id={titleId}
                    eyebrow="Para quem"
                    title="Bom para quem ensina e para quem aprende"
                />

                <div className="home-grid home-grid--two">
                    {audiences.map((audience) => (
                        <FeatureCard
                            key={audience.audience}
                            icon={audience.icon}
                            title={audience.title}
                            description={audience.description}
                            tone={audience.audience === 'teacher' ? 'primary' : 'accent'}
                        >
                            <ul className="home-benefits">
                                {audience.benefits.map((benefit) => (
                                    <li key={benefit}>
                                        <Icon name="check" size={18} className="home-benefits__icon" />
                                        {benefit}
                                    </li>
                                ))}
                            </ul>
                        </FeatureCard>
                    ))}
                </div>
            </div>
        </section>
    );
}
