import { VaultProvider } from '../context/VaultContext';
import PersonalVault from './PersonalVault';

export default function PersonalVaultRoute() {
    return (
        <VaultProvider>
            <PersonalVault />
        </VaultProvider>
    );
}
