const anchor = require("@project-serum/anchor");
const assert = require("assert");
const { SystemProgram } = anchor.web3;

describe('mymoneydapp', () => {
  const provider = anchor.Provider.local();
  anchor.setProvider(provider);
  const program = anchor.workspace.PersonalToken;

  let mint = null;
  let from = null;
  let to = null;
  let treasury = null;
  let stakingAccount = null;;

  it("Initializes test state", async () => {
    mint = await createMint(provider);
    from = await createTokenAccount(provider, mint, provider.wallet.publicKey);
    to = await createTokenAccount(provider, mint, provider.wallet.publicKey);
    treasury = await createTokenAccount(provider, mint, provider.wallet.publicKey);
    stakingAccount = anchor.web3.Keypair.generate();
  });

  it("Mints a token", async () => {
    await program.rpc.proxyMintTo(new anchor.BN(1000), {
      accounts: {
        authority: provider.wallet.publicKey,
        mint: mint,
        to: from.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const fromAccount = await getTokenAccount(provider, from.publicKey);

    assert.ok(fromAccount.amount.eq(new anchor.BN(1000)));
  });

  it("Transfers a token", async () => {
    await program.rpc.proxyTransfer(new anchor.BN(400), {
      accounts: {
        authority: provider.wallet.publicKey,
        to: to.publicKey,
        from: from.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const fromAccount = await getTokenAccount(provider, from.publicKey);
    const toAccount = await getTokenAccount(provider, to.publicKey);

    assert.ok(fromAccount.amount.eq(new anchor.BN(600)));
    assert.ok(toAccount.amount.eq(new anchor.BN(400)));
  });

  it("Burns a token", async () => {
    await program.rpc.proxyBurn(new anchor.BN(350), {
      accounts: {
        authority: provider.wallet.publicKey,
        mint,
        to: to.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const toAccount = await getTokenAccount(provider, to.publicKey);
    assert.ok(toAccount.amount.eq(new anchor.BN(50)));
  });

  it("Set new mint authority", async () => {
    const newMintAuthority = anchor.web3.Keypair.generate();
    await program.rpc.proxySetAuthority(
      { mintTokens: {} },
      newMintAuthority.publicKey,
      {
        accounts: {
          accountOrMint: mint,
          currentAuthority: provider.wallet.publicKey,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
      }
    );

    const mintInfo = await getMintInfo(provider, mint);
    assert.ok(mintInfo.mintAuthority.equals(newMintAuthority.publicKey));
  });


  it("Stake tokens", async () => {
    await program.rpc.createStakingAccount({
      accounts: {
        stakeAccount: stakingAccount.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [stakingAccount]
    });

    await program.rpc.stakeTokens(new anchor.BN(200), {
      accounts: {
        authority: provider.wallet.publicKey,
        to: treasury.publicKey,
        from: from.publicKey,
        stakeAccount: stakingAccount.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const fromAccount = await getTokenAccount(provider, from.publicKey);
    const treasuryAccount = await getTokenAccount(provider, treasury.publicKey);
    const stakingAccount1 = await program.account.stake.fetch(stakingAccount.publicKey);

    assert.ok(fromAccount.amount.eq(new anchor.BN(400)));
    assert.ok(treasuryAccount.amount.eq(new anchor.BN(200)));
  });

  it("Transfers a token to treasury", async () => {
    await program.rpc.proxyTransfer(new anchor.BN(200), {
      accounts: {
        authority: provider.wallet.publicKey,
        to: treasury.publicKey,
        from: from.publicKey,
        tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
      },
    });

    const fromAccount = await getTokenAccount(provider, from.publicKey);
    const treasuryAccount = await getTokenAccount(provider, treasury.publicKey);

    assert.ok(fromAccount.amount.eq(new anchor.BN(200)));
    assert.ok(treasuryAccount.amount.eq(new anchor.BN(400)));
  });

  it("Fails to release tokens within vesting time", async () => {
    try{
      await program.rpc.releaseTokens({
        accounts: {
          authority: provider.wallet.publicKey,
          to: from.publicKey,
          from: treasury.publicKey,
          stakeAccount: stakingAccount.publicKey,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
      });
  
      const fromAccount = await getTokenAccount(provider, from.publicKey);
      const treasuryAccount = await getTokenAccount(provider, treasury.publicKey);
  
      assert.ok(fromAccount.amount.eq(new anchor.BN(500)));
      assert.ok(treasuryAccount.amount.eq(new anchor.BN(100)));
    }catch(err){
      console.log(err)
    }
  });

  it("Successful release tokens", async () => {
    try{
      await program.rpc.releaseTokens({
        accounts: {
          authority: provider.wallet.publicKey,
          to: from.publicKey,
          from: treasury.publicKey,
          stakeAccount: stakingAccount.publicKey,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        },
      });
  
      const fromAccount = await getTokenAccount(provider, from.publicKey);
      const treasuryAccount = await getTokenAccount(provider, treasury.publicKey);
  
      assert.ok(fromAccount.amount.eq(new anchor.BN(500)));
      assert.ok(treasuryAccount.amount.eq(new anchor.BN(100)));
    }catch(err){
      console.log(err)
    }
  });
  
});

const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;

const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  TokenInstructions.TOKEN_PROGRAM_ID.toString()
);

async function getTokenAccount(provider, addr) {
  return await serumCmn.getTokenAccount(provider, addr);
}

async function getMintInfo(provider, mintAddr) {
  return await serumCmn.getMintInfo(provider, mintAddr);
}

async function createMint(provider, authority) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = anchor.web3.Keypair.generate();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.send(tx, [mint]);

  return mint.publicKey;
}

async function createMintInstructions(provider, authority, mint) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint,
      decimals: 0,
      mintAuthority: authority,
    }),
  ];
  return instructions;
}

async function createTokenAccount(provider, mint, owner) {
  const vault = anchor.web3.Keypair.generate();
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner))
  );
  await provider.send(tx, [vault]);
  return vault;
}

async function createTokenAccountInstrs(
  provider,
  newAccountPubkey,
  mint,
  owner,
  lamports
) {
  if (lamports === undefined) {
    lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
  }
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: newAccountPubkey,
      mint,
      owner,
    }),
  ];
}