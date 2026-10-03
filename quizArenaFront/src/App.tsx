import {
    BrowserRouter,
    Routes,
    Route
} from 'react-router-dom';

import LoginForm from './features/auth/components/LoginForm/LoginForm';
//import HomePage from './pages/HomePage';

export default function App() {

    return (
        <BrowserRouter>

            <Routes>

                <Route
                    path="/login"
                    element={<LoginForm onSuccess={function (): void {
                      throw new Error('Function not implemented.');
                    } } />}
                />

                <Route
                    path="/"
                    element={<LoginForm onSuccess={function (): void {
                      throw new Error('Function not implemented.');
                    } } />}
                />

            </Routes>

        </BrowserRouter>
    );
}