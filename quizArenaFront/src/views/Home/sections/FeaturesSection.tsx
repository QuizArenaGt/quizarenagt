import FeatureCard from '../../../components/ui/FeatureCard/FeatureCard';
import SectionHeading from '../../../components/ui/SectionHeading/SectionHeading';
import type { PlatformFeature } from '../../../models/landing';

interface FeaturesSectionProps {
    id: string;
    features: PlatformFeature[];
}

export default function FeaturesSection({ id, features }: FeaturesSectionProps) {
    const titleId = `${id}-titulo`;

    return (
        <section id={id} className="home-section" aria-labelledby={titleId}>
            <div className="container">
                <SectionHeading
                    id={titleId}
                    eyebrow="Recursos"
                    title="O que a plataforma oferece"
                    description="Alguns recursos já estão disponíveis e outros estão em desenvolvimento pela equipe."
                />

                <div className="home-grid home-grid--four">
                    {features.map((feature) => (
                        <FeatureCard
                            key={feature.id}
                            icon={feature.icon}
                            title={feature.title}
                            description={feature.description}
                            status={feature.status}
                            tone={feature.status === 'available' ? 'accent' : 'primary'}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
