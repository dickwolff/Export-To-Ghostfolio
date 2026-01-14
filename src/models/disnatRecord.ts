export class DisnatRecord {
    dateDeTransaction: string; // Date de transaction
    dateDeReglement: string; // Date de règlement  
    typeDeTransaction: string; // Type de transaction
    classeDActif: string; // Classe d'actif
    symbole: string; // Symbole
    description: string; // Description
    marche: string; // Marché
    quantite: number; // Quantité
    prix: number; // Prix
    deviseDuPrix: string; // Devise du prix
    commissionPayee: number; // Commission payée
    montantDeLOperation: number; // Montant de l'opération
    deviseDuCompte: string; // Devise du compte
    
    // Derived fields for processing
    type?: string; // Converted transaction type (buy, sell, dividend, fee, etc.)
    currency?: string; // Normalized currency
    isin?: string; // Will be resolved if available
}