import * as multisig from "@sqds/multisig";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const { Permission, Permissions } = multisig.types;
const connection = new Connection("http://localhost:8899", "confirmed");

describe("Interacting with the Squads V4 SDK", () => {
    const creator = Keypair.generate();
    const secondMember = Keypair.generate();

    before(async () => {
        // Airdrop SOL to the creator's account
        const airdropSignature = await connection.requestAirdrop(
            creator.publicKey,
            1 * LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(airdropSignature);
    });

    const createKey = Keypair.generate().publicKey;

    // Derive the multisig account PDA (Program Derived Address)
    const [multisigPda] = multisig.getMultisigPda({
        createKey,
    });

    it("Create a new multisig", async () => {
        // Create a new multisig account
        const signature = await multisig.rpc.multisigCreate({
            connection,
            // One-time random Key
            createKey,
            // The creator & fee payer
            creator,
            multisigPda,
            configAuthority: null,
            timeLock: 0,
            members: [{
                    key: creator.publicKey,
                    permissions: Permissions.all(),
                },
                {
                    key: secondMember.publicKey,
                    // This permission means that the user will only be able to vote on transactions
                    permissions: Permissions.fromPermissions([Permission.Vote]),
                },
            ],
            // This means that there needs to be 2 votes for a transaction proposal to be approved
            threshold: 2,
        });
        console.log("Multisig created: ", signature);
    });
});

it("Create a transaction proposal", async () => {
    const [vaultPda, vaultBump] = multisig.getVaultPda({
        multisigPda,
        index: 0,
    });

    // Instruction to transfer SOL from the Squads Vault
    const instruction = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: creator.publicKey,
        lamports: 1 * LAMPORTS_PER_SOL
    });

    // Transaction message containing the instructions
    const transferMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [instruction],
    });

    // Creating the first transaction in the multisig
    const transactionIndex = 1n;

    // Create a transaction proposal
    const signature1 = await multisig.rpc.vaultTransactionCreate({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        creator: creator.publicKey,
        vaultIndex: 1,
        ephemeralSigners: 0,
        transactionMessage: transferMessage,
        memo: "Transfer 0.1 SOL to creator",
    });

    console.log("Transaction created: ", signature1);

    // Assuming there's an error in the original code snippet since `members.voter` and `feePayer` are undefined. Assuming `creator` as the feePayer
    const signature2 = await multisig.rpc.proposalCreate({
        connection,
        feePayer: creator, // Assuming creator is the feePayer
        multisigPda,
        transactionIndex,
        creator: creator.publicKey, // Assuming creator as the creator of the proposal
    });
    
    console.log("Transaction proposal created: ", signature2);
});

it("Vote on the created proposal", async () => {
    const transactionIndex = 1n;
    
    // First member approves the proposal
    multisig.rpc.proposalApprove({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: creator.publicKey,
    });

    // Second member approves the proposal
    // Note: Assuming `signers` parameter in proposalApprove is incorrect as it's not in the SDK function definition. Removing it.
    multisig.rpc.proposalApprove({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: secondMember.publicKey,
    });
});

it("Execute the proposal", async () => {
    const transactionIndex = 1n;
    const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex,
    });
    
    // Execute the transaction proposal
    const signature = await multisig.rpc.vaultTransactionExecute({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: creator.publicKey,
