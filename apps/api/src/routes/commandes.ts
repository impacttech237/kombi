import { Hono } from 'hono';
import { z } from 'zod';
import {
  STATUT_COMMANDE, TYPE_COMMANDE, zDateISO, messageErreurZod, compteDeCategorie, peut, type StatutCommande,
} from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, regimeFiscalDe, type AppEnv } from '../types.js';
import { monterRoutesPiece } from '../services/pieces.js';

const zCommande = z.object({
  type: z.enum(TYPE_COMMANDE).optional().default('commande'),
  libelle: z.string().trim().min(1, 'Libellé requis').max(160),
  montant: z.coerce.number().int().nonnegative().nullish(),
  tiersId: z.string().nullish(),
  datePrevue: zDateISO.nullish(),
  clientUuid: z.string().nullish(),
  description: z.string().trim().max(2000).nullish(), priorite: z.enum(['basse','normale','haute','urgente']).default('normale'),
  dateDebut: zDateISO.nullish(), dateRendezVous: z.string().nullish(), datePaiement: zDateISO.nullish(),
  lieu: z.string().trim().max(200).nullish(), responsableId: z.string().nullish(), responsableNom: z.string().nullish(),
  acompte: z.coerce.number().int().nonnegative().default(0), remboursement: z.coerce.number().int().nonnegative().default(0),
  coutBudget: z.coerce.number().int().nonnegative().default(0),
});

export const commandes = new Hono<AppEnv>();

commandes.get('/', requirePermission('commande:read'), async (c) => {
  const e = stubEntreprise(c.env, c.get('entrepriseId'));
  const [liste, taches, commentaires, couts, echeances, historique, pieces, disponibilites, fraisEquipe] = await Promise.all([e.listerCommandes(), e.listerTachesOperations(), e.listerCommentairesOperations(), e.listerCoutsOperations(), e.listerEcheancesOperations(), e.listerHistoriqueOperations(),e.listerPiecesOperations(),e.listerDisponibilitesEquipe(),e.listerFraisEquipe()]);
  const finance=peut(c.get('role'),'compta:read');
  const commandesVisibles=finance?liste:(liste as Record<string,unknown>[]).map((x)=>({...x,montant:null,acompte:0,remboursement:0,cout_budget:0,cout_reel:0,encaissements_echeancier:0,remboursements_echeancier:0,facture_id:null}));
  return c.json({ commandes: commandesVisibles, taches, commentaires, couts:finance?couts:[], echeances:finance?echeances:[], historique, pieces, disponibilites, fraisEquipe:finance?fraisEquipe:[] });
});

commandes.post('/', requirePermission('commande:manage'), async (c) => {
  const parsed = zCommande.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ erreur: messageErreurZod(parsed.error) }, 400);
  const { type, libelle, montant, tiersId, datePrevue, clientUuid, ...details } = parsed.data;

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerCommande({
    type, libelle, tiersId: tiersId ?? null, montant: montant ?? null, datePrevue: datePrevue ?? null,
    clientUuid: clientUuid ?? null, ...details,
  });
  return c.json({ commandeId: id }, 201);
});

const zTache = z.object({
  titre: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullish(),
  priorite: z.enum(['basse','normale','haute','urgente']).default('normale'),
  responsableId: z.string().nullish(), responsableNom: z.string().nullish(), dateEcheance: zDateISO.nullish(), dependDeId: z.string().nullish(),
  parentId:z.string().nullish(),dureeMinutes:z.coerce.number().int().nonnegative().optional(),recurrence:z.enum(['quotidienne','hebdomadaire','mensuelle']).nullish(),assignes:z.array(z.object({id:z.string(),nom:z.string()})).optional(),
});

commandes.post('/:id/commentaires', requirePermission('commande:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 1000) return c.json({ erreur: 'Commentaire invalide' }, 400);
  const commentaireId = await stubEntreprise(c.env, c.get('entrepriseId')).ajouterCommentaireOperation(c.req.param('id'), message, c.get('utilisateurId'), body?.auteurNom);
  return c.json({ commentaireId }, 201);
});
commandes.post('/:id/facture', requirePermission('commande:manage'), async (c) => {
  const factureId = await stubEntreprise(c.env, c.get('entrepriseId')).creerFactureDepuisCommande(c.req.param('id'), (await c.req.json().catch(() => null))?.clientUuid);
  return c.json({ factureId }, 201);
});
commandes.patch('/:id', requirePermission('commande:manage'), async(c)=>{const body=await c.req.json().catch(()=>null);if(!body||typeof body!=='object')return c.json({erreur:'Données invalides'},400);await stubEntreprise(c.env,c.get('entrepriseId')).modifierCommande(c.req.param('id'),body);return c.json({ok:true})});
commandes.post('/:id/dupliquer',requirePermission('commande:manage'),async(c)=>c.json({commandeId:await stubEntreprise(c.env,c.get('entrepriseId')).dupliquerCommande(c.req.param('id'))},201));
commandes.post('/:id/archiver',requirePermission('commande:manage'),async(c)=>{await stubEntreprise(c.env,c.get('entrepriseId')).archiverCommande(c.req.param('id'),true);return c.json({ok:true})});
commandes.post('/:id/couts',requirePermission('commande:manage'),async(c)=>{const b=await c.req.json();if(!b.libelle||!Number.isInteger(b.montant)||b.montant<=0)return c.json({erreur:'Coût invalide'},400);const stub=stubEntreprise(c.env,c.get('entrepriseId'));const categorie=['transport','autre'].includes(b.categorie)?b.categorie:'autre';const dep=await stub.creerDepense({categorie,compteNumero:compteDeCategorie(categorie),libelle:b.libelle,montant:b.montant,modePaiement:b.modePaiement??'especes',clientUuid:b.clientUuid??crypto.randomUUID(),tauxTva:0,regimeFiscal:await regimeFiscalDe(c.env,c.get('entrepriseId')),dateOperation:b.date??null},{utilisateurId:c.get('utilisateurId'),role:c.get('role')});return c.json({coutId:await stub.ajouterCoutOperation(c.req.param('id'),{categorie:b.categorie??'autre',libelle:b.libelle,montant:b.montant,date:b.date??new Date().toISOString().slice(0,10),fournisseurNom:b.fournisseurNom,depenseId:dep.depenseId})},201)});
commandes.delete('/couts/:id',requirePermission('commande:manage'),async(c)=>{await stubEntreprise(c.env,c.get('entrepriseId')).supprimerCoutOperation(c.req.param('id'));return c.json({ok:true})});
commandes.post('/:id/echeances',requirePermission('commande:manage'),async(c)=>{const b=await c.req.json();if(!['encaissement','remboursement'].includes(b.type)||!b.libelle||!Number.isInteger(b.montant)||b.montant<=0||!b.datePrevue)return c.json({erreur:'Échéance invalide'},400);return c.json({echeanceId:await stubEntreprise(c.env,c.get('entrepriseId')).ajouterEcheanceOperation(c.req.param('id'),b)},201)});
commandes.post('/echeances/:id/payer',requirePermission('commande:manage'),async(c)=>{const b=await c.req.json();await stubEntreprise(c.env,c.get('entrepriseId')).payerEcheanceOperation(c.req.param('id'),b.modePaiement??'especes',b.datePaiement);return c.json({ok:true})});
commandes.post('/:id/pieces',requirePermission('commande:manage'),async(c)=>{const type=c.req.header('content-type')??'';if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(type))return c.json({erreur:'Type de fichier non supporté'},415);const data=await c.req.arrayBuffer();if(!data.byteLength||data.byteLength>10*1024*1024)return c.json({erreur:'Fichier vide ou supérieur à 10 Mo'},400);const nom=decodeURIComponent(c.req.header('x-file-name')??'piece');const categorie=c.req.header('x-piece-category')??'autre';const cle=`pieces/${c.get('entrepriseId')}/operation-${c.req.param('id')}-${Date.now()}`;await c.env.DOCS.put(cle,data,{httpMetadata:{contentType:type}});const pieceId=await stubEntreprise(c.env,c.get('entrepriseId')).ajouterPieceOperation(c.req.param('id'),cle,nom,type,categorie);return c.json({pieceId},201)});
commandes.get('/pieces/:pieceId',requirePermission('commande:read'),async(c)=>{const cle=await stubEntreprise(c.env,c.get('entrepriseId')).getPieceOperation(c.req.param('pieceId'));if(!cle)return c.json({erreur:'Pièce introuvable'},404);const o=await c.env.DOCS.get(cle);return o?new Response(o.body,{headers:{'content-type':o.httpMetadata?.contentType??'application/octet-stream'}}):c.json({erreur:'Fichier manquant'},404)});
commandes.delete('/pieces/:pieceId',requirePermission('commande:manage'),async(c)=>{const cle=await stubEntreprise(c.env,c.get('entrepriseId')).supprimerPieceOperation(c.req.param('pieceId'));if(cle)await c.env.DOCS.delete(cle);return c.json({ok:true})});
commandes.post('/equipe/disponibilites',requirePermission('commande:manage'),async(c)=>{const b=await c.req.json();if(!b.utilisateurId||!b.debut||!b.fin)return c.json({erreur:'Période invalide'},400);return c.json({id:await stubEntreprise(c.env,c.get('entrepriseId')).ajouterDisponibiliteEquipe(b)},201)});
commandes.delete('/equipe/disponibilites/:id',requirePermission('commande:manage'),async(c)=>{await stubEntreprise(c.env,c.get('entrepriseId')).supprimerDisponibiliteEquipe(c.req.param('id'));return c.json({ok:true})});
commandes.post('/equipe/frais',requirePermission('depense:manage'),async(c)=>{const b=await c.req.json();if(!b.utilisateurId||!b.libelle||!Number.isInteger(b.montant)||b.montant<=0)return c.json({erreur:'Frais invalide'},400);const stub=stubEntreprise(c.env,c.get('entrepriseId'));const dep=await stub.creerDepense({categorie:b.type==='avance'?'salaires':'autre',compteNumero:compteDeCategorie(b.type==='avance'?'salaires':'autre'),libelle:`${b.type==='avance'?'Avance':'Note de frais'} — ${b.nom} — ${b.libelle}`,montant:b.montant,modePaiement:b.modePaiement??'especes',clientUuid:b.clientUuid??crypto.randomUUID(),dateOperation:b.date??null,regimeFiscal:await regimeFiscalDe(c.env,c.get('entrepriseId'))},{utilisateurId:c.get('utilisateurId'),role:c.get('role')});return c.json({id:await stub.ajouterFraisEquipe({...b,date:b.date??new Date().toISOString().slice(0,10),depenseId:dep.depenseId})},201)});
commandes.post('/:id/taches', requirePermission('commande:manage'), async (c) => {
  const parsed = zTache.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ erreur: messageErreurZod(parsed.error) }, 400);
  const tacheId = await stubEntreprise(c.env, c.get('entrepriseId')).creerTacheOperation(c.req.param('id'), parsed.data);
  return c.json({ tacheId }, 201);
});
commandes.post('/taches/:id/statut', requirePermission('commande:manage'), async (c) => {
  const statut = (await c.req.json().catch(() => null))?.statut;
  if (!['a_faire','en_cours','bloquee','terminee'].includes(statut)) return c.json({ erreur: 'Statut invalide' }, 400);
  await stubEntreprise(c.env, c.get('entrepriseId')).changerStatutTache(c.req.param('id'), statut);
  return c.json({ ok: true });
});
commandes.patch('/taches/:id',requirePermission('commande:manage'),async(c)=>{await stubEntreprise(c.env,c.get('entrepriseId')).modifierTacheOperation(c.req.param('id'),await c.req.json());return c.json({ok:true})});
commandes.delete('/taches/:id',requirePermission('commande:manage'),async(c)=>{await stubEntreprise(c.env,c.get('entrepriseId')).supprimerTacheOperation(c.req.param('id'));return c.json({ok:true})});

commandes.get('/equipe', requirePermission('commande:read'), async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT u.id, u.nom, m.role FROM membre_entreprise m JOIN utilisateur u ON u.id=m.utilisateur_id
      WHERE m.entreprise_id=? ORDER BY u.nom`,
  ).bind(c.get('entrepriseId')).all();
  return c.json({ membres: res.results ?? [] });
});

monterRoutesPiece(commandes, {
  segment: 'operation', permissionLire: 'commande:read', permissionGerer: 'commande:manage', introuvable: 'Opération introuvable',
  existe: (stub,id) => stub.commandeExiste(id), attacher: (stub,id,cle) => stub.attacherPieceCommande(id,cle), lireCle: (stub,id) => stub.getPieceCommande(id),
});

commandes.post('/:id/statut', requirePermission('commande:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const statut = body?.statut as StatutCommande;
  if (!STATUT_COMMANDE.includes(statut)) return c.json({ erreur: 'Statut invalide' }, 400);
  await stubEntreprise(c.env, c.get('entrepriseId')).changerStatutCommande(c.req.param('id'), statut);
  return c.json({ ok: true });
});
