export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-neutral-400">
          ONE SISTEM
        </p>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
          NAKAMA CAR ESTIMATE
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
          Piattaforma professionale per accettazione veicoli, documentazione danni,
          preventivazione e gestione della lavorazione.
        </p>
        <div className="mt-10">
          <button
            type="button"
            className="rounded-xl bg-white px-6 py-3 font-medium text-neutral-950"
          >
            Nuova pratica
          </button>
        </div>
      </section>
    </main>
  );
}
