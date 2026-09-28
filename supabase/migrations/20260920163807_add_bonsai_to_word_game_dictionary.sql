-- RLA-ES v2.9 omits the common Spanish noun "bonsái". Guesses are normalized
-- without accents, so retain its canonical game form as BONSAI.
insert into private.word_dictionary(language, word, enabled)
values ('es', 'BONSAI', true)
on conflict (language, word) do update set enabled = true;
