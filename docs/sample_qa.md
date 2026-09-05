# Sample questions and answers

Every answer below came from the evaluation run in `eval/results.json`, over the
synthetic seed 42 ledger. Account numbers and UTRs are masked everywhere.

## A. Spend

**Question** What did we spend last month?

**Answer** Rs 18,14,11,561.17

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How much went out through NEFT in June?

**Answer** Rs 24,26,57,213.49

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What were bank charges last quarter?

**Answer** Rs 10,13,40,501.91

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What did we spend in May?

**Answer** Rs 70,40,64,585.11

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What did we spend last quarter excluding bank charges?

**Answer** Rs 2,02,77,56,922.59

**Verdict** Fragile

**Read as** debits only, bank charges excluded, all accounts of the entity, calendar period

**Question** What did we spend last month net of receipts?

**Answer** Rs 39,48,69,510.27

**Verdict** Sensitive

**Read as** net of credits, bank charges included, all accounts of the entity, calendar period

**Question** How much went out through UPI last quarter?

**Answer** Rs 32,90,37,828.61

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What did we spend last month across every entity?

**Answer** Rs 73,16,21,823.34

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period


## B. Counterparties

**Question** Who were our top five counterparties last quarter?

**Answer** Rs 7,67,04,495.48

**Verdict** Sensitive

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** Which counterparty received the most last month?

**Answer** Rs 2,25,10,187.82

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How much did SELECTION ELECTRONICS receive in June?

**Answer** Rs 1,33,44,661.96

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How much did the SELECTION family receive last quarter?

**Answer** Rs 4,20,09,250.19

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** Who are the top ten payees this quarter?

**Answer** Rs 48,31,79,433.63

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How much did HARIOM PLASTICS receive last quarter?

**Answer** Rs 3,74,98,300.88

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How much did SELECTION MALIGAI receive last month?

**Answer** Rs 1,19,28,454.02

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period


## C. Receipts and balance

**Question** What did we receive last quarter?

**Answer** Rs 95,26,59,085.01

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What did we receive last month?

**Answer** Rs 33,67,52,313.07

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What is the balance across all our accounts?

**Answer** Rs -3,22,52,45,312.37

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** What is the balance for entity ent-0001?

**Answer** Rs -81,65,36,786.92

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** What did entity ent-0002 receive last month?

**Answer** Rs 7,44,31,641.12

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** What did we receive through disbursements last quarter?

**Answer** Rs 42,20,05,405.31

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period


## D. Reconciliation

**Question** Does our balance match the transactions?

**Answer** Rs 12,500.00

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** Which accounts do not reconcile?

**Answer** Rs 1,05,250.25

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** How many transactions have no reference number or UTR?

**Answer** 3183

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** List the unmatched internal transfers

**Answer** Rs 64,205.00

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** How many transactions have no reference number in June?

**Answer** 398

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period


## E. Lookups

**Question** Find the transaction with reference 7797183088

**Answer** Rs 1,17,577.91

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** Show the transaction with UTR M4oT370J61rntwKK

**Answer** Rs 1,17,577.91

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

**Question** Find the transaction with reference 1715499972

**Answer** Rs 0.00

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity


## F. Follow-ups

**Question** Compare that with the month before

**Answer** Rs 18,14,11,561.17

**Verdict** Sensitive

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** How does that compare with the month before?

**Answer** Rs 18,14,11,561.17

**Verdict** Sensitive

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** And how does that compare with the month before it?

**Answer** Rs 18,14,11,561.17

**Verdict** Sensitive

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** Compare that month with the one before

**Answer** Rs 70,40,64,585.11

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity, calendar period


## G. Guardrails

**Question** How much did we spend on the marketing category last month?

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** How much did we pay ACME CORPORATION last quarter?

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** What is our profit margin this year?

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** Show me the customer email addresses

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** Which vendor is the most reliable?

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** What is the weather in Mumbai?

**Answer** refuse 

**Verdict** Stable

**Read as** No number was computed

**Question** How much did we pay SELECTION last quarter?

**Answer** clarify 

**Verdict** Stable

**Read as** No number was computed

**Question** Compare that with the month before

**Answer** clarify 

**Verdict** Stable

**Read as** No number was computed


## H. Voice

**Question** What did we spend last month?

**Answer** Rs 18,14,11,561.17

**Verdict** Fragile

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** Who were our top five counterparties last quarter?

**Answer** Rs 7,67,04,495.48

**Verdict** Sensitive

**Read as** debits only, bank charges included, all accounts of the entity, calendar period

**Question** Does our balance match the transactions?

**Answer** Rs 12,500.00

**Verdict** Stable

**Read as** debits only, bank charges included, all accounts of the entity

