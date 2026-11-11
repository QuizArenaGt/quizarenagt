import Footer from '../../components/layout/Footer/Footer';
import Header from '../../components/layout/Header/Header';
import { useLandingViewModel } from '../../viewmodels/useLandingViewModel';
import LoginModal from './LoginModal/LoginModal';
import AudienceSection from './sections/AudienceSection';
import FeaturesSection from './sections/FeaturesSection';
import HeroSection from './sections/HeroSection';
import HowItWorksSection from './sections/HowItWorksSection';
import JoinRoomSection from './sections/JoinRoomSection';
import './HomeView.css';

const MAIN_CONTENT_ID = 'conteudo-principal';

/*
 * VIEW da landing page (rota "/").
 *
 * Apenas compõe a página: todo estado e toda decisão vêm do
 * useLandingViewModel, e as seções recebem os dados por props.
 */
export default function HomeView() {
    const viewModel = useLandingViewModel();

    return (
        <div className="home">
            <a href={`#${MAIN_CONTENT_ID}`} className="home__skip-link">
                Pular para o conteúdo
            </a>

            <Header
                navItems={viewModel.navItems}
                activeSectionId={viewModel.activeSectionId}
                onLoginClick={viewModel.openLogin}
            />

            <main id={MAIN_CONTENT_ID}>
                <HeroSection
                    joinRoomSectionId={viewModel.sectionIds.joinRoom}
                    onLoginClick={viewModel.openLogin}
                />
                <HowItWorksSection id={viewModel.sectionIds.howItWorks} steps={viewModel.steps} />
                <AudienceSection id={viewModel.sectionIds.audiences} audiences={viewModel.audiences} />
                <FeaturesSection id={viewModel.sectionIds.features} features={viewModel.features} />
                <JoinRoomSection id={viewModel.sectionIds.joinRoom} />
            </main>

            <Footer />

            <LoginModal
                isOpen={viewModel.isLoginOpen}
                onClose={viewModel.closeLogin}
                onSuccess={viewModel.handleLoginSuccess}
            />
        </div>
    );
}
