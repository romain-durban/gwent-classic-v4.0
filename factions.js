"use strict"

var factions = {
    realms: {
        name: "Northern Realms",
        factionAbility: player => game.roundStart.push(async () => {
            if (game.roundCount > 1 && game.roundHistory[game.roundCount - 2].winner !== player) {
                player.deck.draw(player.hand);
                await ui.notification("north", 1200);
            }
            return false;
        }),
        activeAbility: false,
        abilityUses: 0,
        description: "Draw a card from your deck whenever you lose a round.",
        unavailableSpecials: []
    },
    nilfgaard: {
        name: "Nilfgaardian Empire",
        description: "Wins any round that ends in a draw.",
        activeAbility: false,
        abilityUses: 0,
        unavailableSpecials: []
    },
    monsters: {
        name: "Monsters",
        factionAbility: player => { 
            game.gameStart.push(() => { player.capabilities["endTurnRetake"] = 1; return true; });
            game.roundEnd.push(async () => {
                if (player.capabilities["endTurnRetake"] < 1)
                    return false;
                let cards = new CardContainer();
                cards.cards = player.getAllRowCards();
                let retakeCard = null;
                if (cards.cards.length == 0)
                    return false;
                if (player.controller instanceof ControllerAI) {
                    player.capabilities["endTurnRetake"] = 0;
                    retakeCard = player.controller.medic(player.leader, cards);
                    await ui.notification("monsters", 1200);
                    await board.toHand(retakeCard, retakeCard.currentLocation);
                    return true;
                } else {
                    let c = await ui.popup("Retake a card [E]", (p) => p.choice = true, "Not yet [Q]", (p) => p.choice = false, "Would you like to retake one of your cards?", "Once per battle, you may retake any of your cards from the board to your hand.");
                    if (c) {
                        await ui.queueCarousel(cards, 1, (c, i) => retakeCard = c.cards[i], c => true, true, false, "Which card to retake?");
                        player.capabilities["endTurnRetake"] = 0;
                        await ui.notification("monsters", 1200);
                        await board.toHand(retakeCard, retakeCard.currentLocation);
                        return true;
                    }
                }
                
                return false;
            });
        },
        description: "Once per battle, at the end of the round, you may take one card back to your hand.",
        activeAbility: false,
        abilityUses: 0,
        unavailableSpecials: []
    },
    scoiatael: {
        name: "Scoia'tael",
        factionAbility: player => game.roundStart.push(async () => {
            let notif = "";
            if (!game.isPvP() && player === player_me && !(player.controller instanceof ControllerAI)) {
                await ui.popup("Go First [E]", () => game.currPlayer = player, "Let Opponent Start [Q]", () => game.currPlayer = player.opponent(), "Would you like to go first?", "The Scoia'tael faction perk allows you to decide each round who will get to go first.");
                notif = game.currPlayer.tag + "-first";
            } else if (game.isPvP()) {
                await ui.popup("Player 1 first [E]", () => game.currPlayer = player_me, "Player 2 first [Q]", () => game.currPlayer = player_op, "Who should go first?", "The Scoia'tael faction perk allows you to decide each round who will get to go first.");
                notif = game.currPlayer.tag + "-first";
            } else if (player.controller instanceof ControllerAI) {
                if (Math.random() < 0.5) {
                    game.currPlayer = player;
                    notif = "scoiatael";
                } else {
                    game.currPlayer = player.opponent();
                    notif = game.currPlayer.tag + "-first";
                }
            }
            //Tricky bit, sides are actually swapped shortly after
            game.currPlayer = game.currPlayer.opponent(); 
            // If first round, set first player too
            if (game.roundCount == 1)
                game.firstPlayer = game.currPlayer;
            await ui.notification(notif, 1200);
            return false;
        }),
        description: "Decides who takes first turn on each round.",
        activeAbility: false,
        abilityUses: 0,
        unavailableSpecials: []
    },
    skellige: {
        name: "Skellige",
        factionAbility: player => game.roundStart.push(async () => {
            if (game.roundCount != 3)
                return false;
            await ui.notification("skellige-" + player.tag, 1200);
            await Promise.all(player.grave.findCardsRandom(c => c.isUnit(), 2).map(c => board.toRow(c, player.grave)));
            return true;
        }),
        description: "2 random cards from the graveyard are placed on the battlefield at the start of the third round.",
        activeAbility: false,
        abilityUses: 0,
        unavailableSpecials: []
    },
    witcher_universe: {
        name: "Witcher Universe",
        factionAbility: async player => {
            await ui.notification("witcher_universe", 1200);
        },
        factionAbilityInit: player => game.roundStart.push(async () => {
            player.updateFactionAbilityUses(1);
            return false;
        }),
        description: "Can skip a turn once every round.",
        activeAbility: true,
        abilityUses: 1,
        weight: (player) => {
            return 20;
        },
        unavailableSpecials: []
    },
    toussaint: {
        name: "Toussaint",
        factionAbility: async player => {
            let monsters = player.getAllRowCards().filter(c => c.abilities.includes("monster_toussaint") && !c.isLocked());
            if (monsters.length < 1)
                return;
            let targetCard = null;
            if (player.controller instanceof ControllerAI) {
                let targets = monsters.map(c => new Card(c.target, card_dict[c.target], player));
                let best = player.controller.getHighestWeightCard(targets);
                if(best)
                    targetCard = monsters.filter(c => c.target === best.key)[0];
            } else {
                await ui.queueCarousel({ cards: monsters }, 1, async (c, i) => targetCard = c.cards[i], () => true, true, false, "Choose which monster to transform.");
            }
            if (targetCard) {
                let newCard = new Card(targetCard.target, card_dict[targetCard.target], player);
                targetCard.currentLocation.removeCard(targetCard);
                player.deck.addCard(newCard);
                //await board.addCardToRow(newCard, targetCard.currentLocation, player);
                if (player.controller instanceof ControllerAI) {
                    newCard.autoplay(player.deck);
                } else {
                    // let player select where to play the card
                    player.selectCardDestination(newCard, player.deck);
                }
            }
        },
        factionAbilityInit: player => {
            game.gameStart.push(async () => {
                player.mulliganCount = 3;
                return true;
            });
            game.turnStart.push(async () => {
                if (player.getAllRowCards().filter(c => c.abilities.includes("monster_toussaint")).length > 0)
                    player.updateFactionAbilityUses(1);
                else
                    player.updateFactionAbilityUses(0);
                return false;
            })
        },
        weight: (player) => {
            let monsters = player.getAllRowCards().filter(c => c.abilities.includes("monster_toussaint") && !c.isLocked());
            if (monsters.length < 1)
                return 0;
            let targets = monsters.map(c => new Card(c.target, card_dict[c.target], player));
            let w = player.controller.getWeights(targets).sort((a, b) => (b.weight - a.weight));
            return w[0].weight;
        },
        activeAbility: true,
        abilityUses: 0,
        description: "At the beginning of the game, you can change 3 cards instead of 2. During the game, you can turn a Toussaint Monster into its next form instead of playing a card.",
        unavailableSpecials: ["spe_frost", "spe_fog","spe_rain"]
    },
    lyria_rivia: {
        name: "Lyria & Rivia",
        factionAbility: player => {
            let card = new Card("spe_lyria_rivia_morale", card_dict["spe_lyria_rivia_morale"], player);
            card.removed.push(() => setTimeout(() => card.holder.grave.removeCard(card), 2000));
            card.placed.push(async () => await ui.notification("lyria_rivia", 1200));
            player.endTurnAfterAbilityUse = false;
            ui.showPreviewVisuals(card);
            ui.enablePlayer(true);
            if (!(player.controller instanceof ControllerAI))
                ui.setSelectable(card, true);
        },
        activeAbility: true,
        abilityUses: 1,
        description: "Apply a Morale Boost effect in the selected row (boost all units by 1 in this turn).",
        weight: (player) => {
            let units = player.getAllRowCards().concat(player.hand.cards).filter(c => c.isUnit()).filter(c => !c.abilities.includes("spy"));
            let rowStats = {
                "close": 0,
                "ranged": 0,
                "siege": 0,
                "agile": 0
            };
            units.forEach(c => {
                rowStats[c.row] += 1;
            });
            rowStats["close"] += rowStats["agile"];
            return Math.max(rowStats["close"], rowStats["ranged"], rowStats["siege"]);
        },
        unavailableSpecials: []
    },
    syndicate: {
        name: "Syndicate",
        factionAbility: player => game.gameStart.push(async () => {
            let card = new Card("sy_sigi_reuven", card_dict["sy_sigi_reuven"], player);
            await board.addCardToRow(card, card.row, card.holder);
        }),
        activeAbility: false,
        abilityUses: 0,
        description: "Starts the game with the Hero card Sigi Reuven on the board.",
        unavailableSpecials: []
    },
    zerrikania: {
        name: "Zerrikania",
        factionAbility: player => game.roundStart.push(async () => {
            if (game.roundCount > 1 && !(game.roundHistory[game.roundCount - 2].winner === player)) {
                if (player.grave.findCards(c => c.isUnit()) <= 0)
                    return;
                let grave = player.grave;
                let respawns = [];
                if (player.controller instanceof ControllerAI) {
                    respawns.push({
                        card: player.controller.medic(player.leader, grave)
                    });
                } else {
                    await ui.queueCarousel(player.grave, 1, (c, i) => respawns.push({
                        card: c.cards[i]
                    }), c => c.isUnit(), true);
                }
                await Promise.all(respawns.map(async wrapper => {
                    let res = wrapper.card;
                    grave.removeCard(res);
                    grave.addCard(res);
                    await res.animate("medic");
                    await res.autoplay(grave);
                }));
                await ui.notification("zerrikania", 1200);
            }
            return false;
        }),
        activeAbility: false,
        abilityUses: 0,
        description: "Restore a unit card of your choice whenever you lose a round.",
        unavailableSpecials: []
    },
    redania: {
        name: "Redania",
        factionAbility: async player => {
            await ui.notification("redania", 1200);
        },
        factionAbilityInit: player => game.gameStart.push(async () => {
            player.updateFactionAbilityUses(1);
            return false;
        }),
        description: "Can skip a turn once per game.",
        activeAbility: true,
        abilityUses: 1,
        weight: (player) => {
            return 20;
        },
        unavailableSpecials: ["spe_scorch"]
    },
    velen: {
        name: "Velen",
        factionAbilityAction: async player => {
            await ui.notification("velen", 1000);
            let cardsToDraw = player.velenCardDraw + player.getAllRowCards().filter(c => c.abilities.includes("soothsayer")).length;
            let cards = { cards: player.deck.cards.slice(0, cardsToDraw) };
            let targetCard = null;
            ui.helper.showMessage(String(player.destroyedCards)+" card(s) were destroyed last round.",3);
            if (player.controller instanceof ControllerAI) {
                targetCard = player.controller.getHighestWeightCard(cards.cards);
            } else {
                try {
                    Carousel.curr.cancel();
                } catch (err) { }
                await ui.queueCarousel(cards, 1, (c, i) => targetCard = c.cards[i], c => true, true, true, "Choose up to one card to draw and play immediatly");
            }
            if (player.destroyedCards > 1) {
                player.destroyedCards = 1;
            } else {
                player.destroyedCards = 0;
            }
            cards.cards.forEach(c => {
                if (c !== targetCard) {
                    // Remove to shuffle back at a random place (default behaviour on addCard in deck)
                    player.deck.removeCard(c);
                    player.deck.addCard(c);
                }
            });
            // Game can get stuck if the player selects a Decoy but there is no decoyable card
            if (targetCard.key === "spe_decoy") {
                let units = player.getAllRowCards().filter(c => c.isUnit());
                if (units.length == 0) {
                    await board.toHand(targetCard, player.deck);
                    targetCard = null;
                }
            }
            if (player.controller instanceof ControllerAI) {
                if(targetCard)
                    targetCard.autoplay(player.deck);
                // If more than 1 card was destroyed, we trigger the faction ability once more
                if (player.destroyedCards > 0) {
                    await factions["velen"].factionAbilityAction(player);
                }
            } else {
                if (targetCard) {
                    // let player select where to play the card
                    let choiceDone = false;
                    player.selectCardDestination(targetCard, player.deck, async () => {
                        choiceDone = true;
                    });
                    // We sleep until the choice is made, otherwise the round starts as normal
                    await sleepUntil(() => choiceDone, 100);
                }
                // If more than 1 card was destroyed, we trigger the faction ability once more
                if (player.destroyedCards > 0) {
                    await factions["velen"].factionAbilityAction(player);
                }
            }
        },
        factionAbility: player => {
            game.gameStart.push(async () => {
                player.destroyedCards = 0;
                player.velenCardDraw = 1;
                return false;
            });
            game.unitDestroyed.push(async c => {
                if (c.isUnit())
                    player.destroyedCards += 1;
            });
            game.turnStart.push(async () => {
                if (player.destroyedCards > 0) {
                    await factions["velen"].factionAbilityAction(player);
                }
                return false;
            });
        },
        description: "Every time when a unit card of any player dies, draw one card from your deck and play it immediatly. If several unit cards die at the same time, repeat this action once. If you don't want to play a drawn card, shuffle it back into the deck.",
        activeAbility: false,
        abilityUses: 0,
        weight: (player) => {
            return 0;
        },
        unavailableSpecials: []
    },
}