using System;
using System.Collections.Generic;
using Core.Models;
using Microsoft.EntityFrameworkCore;

namespace Core.DbContexts;

public partial class EnergimerkingContext : DbContext
{
    public EnergimerkingContext(DbContextOptions<EnergimerkingContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Bygning> Bygnings { get; set; }

    public virtual DbSet<Coordinate> Coordinates { get; set; }

    public virtual DbSet<CoordinatesRaw> CoordinatesRaws { get; set; }

    public virtual DbSet<DenormMatrikkelOgEnovaOslo> DenormMatrikkelOgEnovaOslos { get; set; }

    public virtual DbSet<Eiendom> Eiendoms { get; set; }

    public virtual DbSet<EiendomBygning> EiendomBygnings { get; set; }

    public virtual DbSet<Energikarakter> Energikarakters { get; set; }

    public virtual DbSet<Energimerke> Energimerkes { get; set; }

    public virtual DbSet<EnovaRaw> EnovaRaws { get; set; }

    public virtual DbSet<Kommune> Kommunes { get; set; }

    public virtual DbSet<MvByggMedKoordinater> MvByggMedKoordinaters { get; set; }

    public virtual DbSet<MvEnergimerke> MvEnergimerkes { get; set; }

    public virtual DbSet<MvLeilighetSisteEnergimerke> MvLeilighetSisteEnergimerkes { get; set; }

    public virtual DbSet<MveEnergimerke> MveEnergimerkes { get; set; }

    public virtual DbSet<Oppvarmingskarakter> Oppvarmingskarakters { get; set; }

    public virtual DbSet<VByggMedKoordinater> VByggMedKoordinaters { get; set; }

    public virtual DbSet<VEnergimerkeOslo> VEnergimerkeOslos { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasPostgresExtension("fuzzystrmatch")
            .HasPostgresExtension("pg_trgm")
            .HasPostgresExtension("postgis")
            .HasPostgresExtension("tiger", "postgis_tiger_geocoder")
            .HasPostgresExtension("topology", "postgis_topology");

        modelBuilder.Entity<Bygning>(entity =>
        {
            entity.HasKey(e => e.BygningId).HasName("pk_bygning_bygningid");

            entity.ToTable("bygning");

            entity.HasIndex(e => e.BygningId, "idx_bygning_bygningid");

            entity.HasIndex(e => e.Bygningsnummer, "idx_bygning_bygningnummer");

            entity.HasIndex(e => e.Bygningsnummer, "idx_bygning_bygningsnummer");

            entity.HasIndex(e => e.EiendomId, "idx_bygning_eiendom");

            entity.Property(e => e.BygningId)
                .HasDefaultValueSql("nextval('eiendom_id_seq'::regclass)")
                .HasColumnName("bygningID");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Materialvalg)
                .HasMaxLength(100)
                .HasColumnName("materialvalg");
            entity.Property(e => e.Seksjonsnummer)
                .HasDefaultValue(0)
                .HasColumnName("seksjonsnummer");

            entity.HasOne(d => d.Eiendom).WithMany(p => p.Bygnings)
                .HasForeignKey(d => d.EiendomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("bygning_eiendom_id_fkey");
        });

        modelBuilder.Entity<Coordinate>(entity =>
        {
            entity.HasKey(e => e.Coordinateid).HasName("pk_coordinates_coordinateid");

            entity.ToTable("coordinates");

            entity.HasIndex(e => e.Adresse, "idx_coordinates_adresse");

            entity.HasIndex(e => e.Adresse, "idx_coordinates_adresse_trgm")
                .HasMethod("gin")
                .HasOperators(new[] { "gin_trgm_ops" });

            entity.HasIndex(e => e.Coordinateid, "idx_coordinates_coordinateid");

            entity.HasIndex(e => e.Geography, "idx_coordinates_geography").HasMethod("gist");

            entity.HasIndex(e => e.Kommunenummer, "idx_coordinates_kommune");

            entity.HasIndex(e => e.Kommunenummer, "idx_coordinates_kommune_btree");

            entity.HasIndex(e => new { e.Latitude, e.Longitude }, "idx_coordinates_latlon");

            entity.HasIndex(e => e.Lokalid, "idx_coordinates_lokalid");

            entity.HasIndex(e => new { e.Kommunenummer, e.Gaardsnummer, e.Bruksnummer }, "idx_coordinates_matrikkel");

            entity.Property(e => e.Coordinateid)
                .HasDefaultValueSql("nextval('matrikkelen_id_seq'::regclass)")
                .HasColumnName("coordinateid");
            entity.Property(e => e.Adresse).HasColumnName("adresse");
            entity.Property(e => e.Bruksnummer).HasColumnName("bruksnummer");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.Geography)
                .HasColumnType("geography(Point,4258)")
                .HasColumnName("geography");
            entity.Property(e => e.Kommunenummer)
                .HasColumnType("character varying")
                .HasColumnName("kommunenummer");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Lokalid).HasColumnName("lokalid");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.MatrikkelNøkkel)
                .HasMaxLength(50)
                .HasColumnName("matrikkel_nøkkel");
        });

        modelBuilder.Entity<CoordinatesRaw>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("coordinates_raw");

            entity.HasIndex(e => e.Col2, "idx_raw_col2");

            entity.HasIndex(e => e.Col3, "idx_raw_col3");

            entity.HasIndex(e => new { e.Col7, e.Col8 }, "idx_raw_numeric");

            entity.Property(e => e.Col1).HasColumnName("col1");
            entity.Property(e => e.Col10).HasColumnName("col10");
            entity.Property(e => e.Col11).HasColumnName("col11");
            entity.Property(e => e.Col12).HasColumnName("col12");
            entity.Property(e => e.Col13).HasColumnName("col13");
            entity.Property(e => e.Col14).HasColumnName("col14");
            entity.Property(e => e.Col15).HasColumnName("col15");
            entity.Property(e => e.Col16).HasColumnName("col16");
            entity.Property(e => e.Col17).HasColumnName("col17");
            entity.Property(e => e.Col18).HasColumnName("col18");
            entity.Property(e => e.Col19).HasColumnName("col19");
            entity.Property(e => e.Col2).HasColumnName("col2");
            entity.Property(e => e.Col20).HasColumnName("col20");
            entity.Property(e => e.Col21).HasColumnName("col21");
            entity.Property(e => e.Col22).HasColumnName("col22");
            entity.Property(e => e.Col23).HasColumnName("col23");
            entity.Property(e => e.Col24).HasColumnName("col24");
            entity.Property(e => e.Col25).HasColumnName("col25");
            entity.Property(e => e.Col26).HasColumnName("col26");
            entity.Property(e => e.Col27).HasColumnName("col27");
            entity.Property(e => e.Col28).HasColumnName("col28");
            entity.Property(e => e.Col29).HasColumnName("col29");
            entity.Property(e => e.Col3).HasColumnName("col3");
            entity.Property(e => e.Col30).HasColumnName("col30");
            entity.Property(e => e.Col31).HasColumnName("col31");
            entity.Property(e => e.Col32).HasColumnName("col32");
            entity.Property(e => e.Col33).HasColumnName("col33");
            entity.Property(e => e.Col34).HasColumnName("col34");
            entity.Property(e => e.Col35).HasColumnName("col35");
            entity.Property(e => e.Col36).HasColumnName("col36");
            entity.Property(e => e.Col37).HasColumnName("col37");
            entity.Property(e => e.Col38).HasColumnName("col38");
            entity.Property(e => e.Col39).HasColumnName("col39");
            entity.Property(e => e.Col4).HasColumnName("col4");
            entity.Property(e => e.Col40).HasColumnName("col40");
            entity.Property(e => e.Col41).HasColumnName("col41");
            entity.Property(e => e.Col42).HasColumnName("col42");
            entity.Property(e => e.Col43).HasColumnName("col43");
            entity.Property(e => e.Col44).HasColumnName("col44");
            entity.Property(e => e.Col45).HasColumnName("col45");
            entity.Property(e => e.Col46).HasColumnName("col46");
            entity.Property(e => e.Col47).HasColumnName("col47");
            entity.Property(e => e.Col5).HasColumnName("col5");
            entity.Property(e => e.Col6).HasColumnName("col6");
            entity.Property(e => e.Col7).HasColumnName("col7");
            entity.Property(e => e.Col8).HasColumnName("col8");
            entity.Property(e => e.Col9).HasColumnName("col9");
        });

        modelBuilder.Entity<DenormMatrikkelOgEnovaOslo>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("denorm_matrikkel_og_enova_oslo_pkey");

            entity.ToTable("denorm_matrikkel_og_enova_oslo");

            entity.HasIndex(e => new { e.Lat, e.Lon, e.Id }, "idx_denorm_oslo_tile_bounds")
                .HasFilter("\"kommuneNr\" IS NOT NULL AND coordinate IS NOT NULL AND lat IS NOT NULL AND lon IS NOT NULL");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.Adresse).HasColumnName("adresse");
            entity.Property(e => e.AndelsNr).HasColumnName("andelsNr");
            entity.Property(e => e.AttestNr).HasColumnName("attestNr");
            entity.Property(e => e.BeregnetLevertEnergiTotaltkWhm2).HasColumnName("beregnetLevertEnergiTotaltkWhm2");
            entity.Property(e => e.BruksNr).HasColumnName("bruksNr");
            entity.Property(e => e.BruksenhetsNr).HasColumnName("bruksenhetsNr");
            entity.Property(e => e.Byggeår).HasColumnName("byggeår");
            entity.Property(e => e.Coordinate)
                .HasColumnType("geography")
                .HasColumnName("coordinate");
            entity.Property(e => e.Energikarakter).HasColumnName("energikarakter");
            entity.Property(e => e.FesteNr).HasColumnName("festeNr");
            entity.Property(e => e.GaardsNr).HasColumnName("gaardsNr");
            entity.Property(e => e.KommuneNr).HasColumnName("kommuneNr");
            entity.Property(e => e.Lat).HasColumnName("lat");
            entity.Property(e => e.Lon).HasColumnName("lon");
            entity.Property(e => e.Matierialvalg).HasColumnName("matierialvalg");
            entity.Property(e => e.Oppvarmingskarakter).HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.OrganisasjonsNr).HasColumnName("organisasjonsNr");
            entity.Property(e => e.SeksjonsNr).HasColumnName("seksjonsNr");
            entity.Property(e => e.UtstedelsesDato)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("utstedelsesDato");
        });

        modelBuilder.Entity<Eiendom>(entity =>
        {
            entity.HasKey(e => e.EiendomId).HasName("eiendom_pkey");

            entity.ToTable("eiendom");

            entity.HasIndex(e => e.Kommunenummer, "eiendom_table_btree");

            entity.HasIndex(e => e.Adresse, "idx_eiendom_adresse")
                .HasMethod("gin")
                .HasOperators(new[] { "gin_trgm_ops" });

            entity.HasIndex(e => e.Brukenhetsnummer, "idx_eiendom_brukenhetsnummer");

            entity.HasIndex(e => e.Coordinateid, "idx_eiendom_coordinateid");

            entity.HasIndex(e => e.EiendomId, "idx_eiendom_eiendomid");

            entity.HasIndex(e => new { e.Kommunenummer, e.Gaardsnummer, e.Bruksnummer }, "idx_eiendom_gnr_bnr_knr");

            entity.HasIndex(e => new { e.Kommunenummer, e.Gaardsnummer, e.Bruksnummer }, "idx_eiendom_kommune_gnr_bnr");

            entity.HasIndex(e => new { e.Kommunenummer, e.Gaardsnummer, e.Brukenhetsnummer }, "idx_eiendom_kommune_gnr_bnr_bruk");

            entity.HasIndex(e => new { e.Kommunenummer, e.Coordinateid }, "idx_eiendom_kommunenummer_coord");

            entity.HasIndex(e => e.Lokalid, "idx_eiendom_lokalid");

            entity.HasIndex(e => new { e.Kommunenummer, e.Gaardsnummer, e.Bruksnummer }, "idx_eiendom_matrikkel").HasFilter("(coordinateid IS NULL)");

            entity.Property(e => e.EiendomId)
                .HasDefaultValueSql("nextval('eiendom_eiendom_id_seq'::regclass)")
                .HasColumnName("eiendomId");
            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Andelsnummer)
                .HasDefaultValue(0)
                .HasColumnName("andelsnummer");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Bruksnummer).HasColumnName("bruksnummer");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.Festenummer).HasColumnName("festenummer");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.Kommunenummer)
                .HasMaxLength(4)
                .HasColumnName("kommunenummer");
            entity.Property(e => e.Lokalid).HasColumnName("lokalid");
            entity.Property(e => e.MatrikkelNøkkel)
                .HasMaxLength(50)
                .HasColumnName("matrikkel_nøkkel");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Seksjonsnummer)
                .HasDefaultValue(0)
                .HasColumnName("seksjonsnummer");

            entity.HasOne(d => d.Coordinate).WithMany(p => p.Eiendoms)
                .HasForeignKey(d => d.Coordinateid)
                .HasConstraintName("fk_eiendom_coordinates");

            entity.HasOne(d => d.KommunenummerNavigation).WithMany(p => p.Eiendoms)
                .HasForeignKey(d => d.Kommunenummer)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("eiendom_kommunenummer_fkey");
        });

        modelBuilder.Entity<EiendomBygning>(entity =>
        {
            entity.HasKey(e => e.BygningeiendomId).HasName("bygning_eiendom_pkey");

            entity.ToTable("eiendom_bygning");

            entity.HasIndex(e => e.BygningId, "idx_bygning_eiendom_bygningid");

            entity.HasIndex(e => e.EiendomId, "idx_bygning_eiendom_eiendomid");

            entity.HasIndex(e => e.Coordinateid, "idx_eiendom_bygning_coordinateid");

            entity.HasIndex(e => new { e.EiendomId, e.BygningId }, "unik_eiendom_bygning").IsUnique();

            entity.Property(e => e.BygningeiendomId)
                .HasDefaultValueSql("nextval('\"bygning_eiendom_bygningEiendomId_seq\"'::regclass)")
                .HasColumnName("bygningeiendomId");
            entity.Property(e => e.BygningId).HasColumnName("bygningID");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");

            entity.HasOne(d => d.Bygning).WithMany(p => p.EiendomBygnings)
                .HasForeignKey(d => d.BygningId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_bygning");

            entity.HasOne(d => d.Coordinate).WithMany(p => p.EiendomBygnings)
                .HasForeignKey(d => d.Coordinateid)
                .HasConstraintName("bygning_eiendom_coordinateid_fkey");

            entity.HasOne(d => d.Eiendom).WithMany(p => p.EiendomBygnings)
                .HasForeignKey(d => d.EiendomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("fk_eiendom");
        });

        modelBuilder.Entity<Energikarakter>(entity =>
        {
            entity.HasKey(e => e.Bokstav).HasName("energikarakter_pkey");

            entity.ToTable("energikarakter");

            entity.Property(e => e.Bokstav)
                .HasMaxLength(1)
                .HasColumnName("bokstav");
            entity.Property(e => e.Beskrivelse)
                .HasMaxLength(100)
                .HasColumnName("beskrivelse");
        });

        modelBuilder.Entity<Energimerke>(entity =>
        {
            entity.HasKey(e => e.Attestnummer).HasName("energimerke_pkey");

            entity.ToTable("energimerke");

            entity.HasIndex(e => e.Attestnummer, "idx_energimerke_attestnummer");

            entity.HasIndex(e => e.BygningeiendomId, "idx_energimerke_bygningeiendomid");

            entity.HasIndex(e => new { e.BygningeiendomId, e.Utstedelsesdato }, "idx_energimerke_bygningeiendomid_dato").IsDescending(false, true);

            entity.HasIndex(e => e.Bygningsnummer, "idx_energimerke_bygningsnummer");

            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.BygningeiendomId).HasColumnName("bygningeiendomId");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.EnergivurderingDato).HasColumnName("energivurdering_dato");
            entity.Property(e => e.HarEnergivurdering).HasColumnName("har_energivurdering");
            entity.Property(e => e.Kilde)
                .HasMaxLength(50)
                .HasDefaultValueSql("'Enova API'::character varying")
                .HasColumnName("kilde");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Typeregistrering)
                .HasMaxLength(50)
                .HasColumnName("typeregistrering");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");

            entity.HasOne(d => d.Bygningeiendom).WithMany(p => p.Energimerkes)
                .HasForeignKey(d => d.BygningeiendomId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("fk_energimerke_bygning_eiendom");

            entity.HasOne(d => d.EnergikarakterNavigation).WithMany(p => p.Energimerkes)
                .HasForeignKey(d => d.Energikarakter)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("energimerke_energikarakter_fkey");
        });

        modelBuilder.Entity<EnovaRaw>(entity =>
        {
            entity.HasKey(e => e.Col19).HasName("iterationKey");

            entity.ToTable("enova_raw");

            entity.HasIndex(e => e.Col1, "idx_enova_raw_col1");

            entity.HasIndex(e => new { e.Col1, e.Col2, e.Col11 }, "idx_enova_raw_col1_col2_col11");

            entity.HasIndex(e => e.Col2, "idx_enova_raw_col2");

            entity.HasIndex(e => e.Col3, "idx_enova_raw_col3");

            entity.HasIndex(e => e.Col7, "idx_enova_raw_col7");

            entity.Property(e => e.Col19).HasColumnName("col19");
            entity.Property(e => e.Col1).HasColumnName("col1");
            entity.Property(e => e.Col10).HasColumnName("col10");
            entity.Property(e => e.Col11).HasColumnName("col11");
            entity.Property(e => e.Col12).HasColumnName("col12");
            entity.Property(e => e.Col13).HasColumnName("col13");
            entity.Property(e => e.Col14).HasColumnName("col14");
            entity.Property(e => e.Col15).HasColumnName("col15");
            entity.Property(e => e.Col16).HasColumnName("col16");
            entity.Property(e => e.Col17).HasColumnName("col17");
            entity.Property(e => e.Col18).HasColumnName("col18");
            entity.Property(e => e.Col2).HasColumnName("col2");
            entity.Property(e => e.Col20).HasColumnName("col20");
            entity.Property(e => e.Col21).HasColumnName("col21");
            entity.Property(e => e.Col22).HasColumnName("col22");
            entity.Property(e => e.Col23).HasColumnName("col23");
            entity.Property(e => e.Col24).HasColumnName("col24");
            entity.Property(e => e.Col3).HasColumnName("col3");
            entity.Property(e => e.Col4).HasColumnName("col4");
            entity.Property(e => e.Col5).HasColumnName("col5");
            entity.Property(e => e.Col6).HasColumnName("col6");
            entity.Property(e => e.Col7).HasColumnName("col7");
            entity.Property(e => e.Col8).HasColumnName("col8");
            entity.Property(e => e.Col9).HasColumnName("col9");
        });

        modelBuilder.Entity<Kommune>(entity =>
        {
            entity.HasKey(e => e.Kommunenummer).HasName("kommune_pkey");

            entity.ToTable("kommune");

            entity.Property(e => e.Kommunenummer)
                .HasMaxLength(4)
                .HasColumnName("kommunenummer");
            entity.Property(e => e.Navn)
                .HasMaxLength(100)
                .HasColumnName("navn");
        });

        modelBuilder.Entity<MvByggMedKoordinater>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("mv_bygg_med_koordinater");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.BygningId).HasColumnName("bygningID");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Festenummer).HasColumnName("festenummer");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });

        modelBuilder.Entity<MvEnergimerke>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("mv_energimerke");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Bruksnummer).HasColumnName("bruksnummer");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.Kommunenummer)
                .HasMaxLength(4)
                .HasColumnName("kommunenummer");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });

        modelBuilder.Entity<MvLeilighetSisteEnergimerke>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("mv_leilighet_siste_energimerke");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Rn).HasColumnName("rn");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });

        modelBuilder.Entity<MveEnergimerke>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("mve_energimerke");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Bruksnummer).HasColumnName("bruksnummer");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.Kommunenummer)
                .HasMaxLength(4)
                .HasColumnName("kommunenummer");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });

        modelBuilder.Entity<Oppvarmingskarakter>(entity =>
        {
            entity.HasKey(e => e.Kode).HasName("oppvarmingskarakter_pkey");

            entity.ToTable("oppvarmingskarakter");

            entity.Property(e => e.Kode)
                .HasMaxLength(10)
                .HasColumnName("kode");
            entity.Property(e => e.Beskrivelse)
                .HasMaxLength(100)
                .HasColumnName("beskrivelse");
        });

        modelBuilder.Entity<VByggMedKoordinater>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_bygg_med_koordinater");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.Brukenhetsnummer)
                .HasColumnType("character varying")
                .HasColumnName("brukenhetsnummer");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.BygningId).HasColumnName("bygningID");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Festenummer).HasColumnName("festenummer");
            entity.Property(e => e.Gaardsnummer).HasColumnName("gaardsnummer");
            entity.Property(e => e.KoordinatStatus).HasColumnName("koordinat_status");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });

        modelBuilder.Entity<VEnergimerkeOslo>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_energimerke_oslo");

            entity.Property(e => e.Adresse)
                .HasMaxLength(200)
                .HasColumnName("adresse");
            entity.Property(e => e.Attestnummer)
                .HasMaxLength(50)
                .HasColumnName("attestnummer");
            entity.Property(e => e.BeregnetEnergiKwhM2)
                .HasPrecision(10, 2)
                .HasColumnName("beregnet_energi_kwh_m2");
            entity.Property(e => e.BeregnetFossilandel).HasColumnName("beregnet_fossilandel");
            entity.Property(e => e.Byggeaar).HasColumnName("byggeaar");
            entity.Property(e => e.Bygningskategori)
                .HasMaxLength(50)
                .HasColumnName("bygningskategori");
            entity.Property(e => e.Bygningsnummer)
                .HasMaxLength(50)
                .HasColumnName("bygningsnummer");
            entity.Property(e => e.Coordinateid).HasColumnName("coordinateid");
            entity.Property(e => e.EiendomId).HasColumnName("eiendomId");
            entity.Property(e => e.Energikarakter)
                .HasMaxLength(1)
                .HasColumnName("energikarakter");
            entity.Property(e => e.Latitude).HasColumnName("latitude");
            entity.Property(e => e.Longitude).HasColumnName("longitude");
            entity.Property(e => e.Oppvarmingskarakter)
                .HasMaxLength(10)
                .HasColumnName("oppvarmingskarakter");
            entity.Property(e => e.Postnummer)
                .HasMaxLength(4)
                .HasColumnName("postnummer");
            entity.Property(e => e.Poststed)
                .HasMaxLength(100)
                .HasColumnName("poststed");
            entity.Property(e => e.Utstedelsesdato).HasColumnName("utstedelsesdato");
        });
        modelBuilder.HasSequence("bygning_eiendomid_seq").StartsAt(1000000L);
        modelBuilder.HasSequence("eiendom_id_seq");

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
