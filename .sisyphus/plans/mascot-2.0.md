# PromKep-Tutra 2.0: Mascot Edition + Group System

## TL;DR

Redesign PromKep-Tutra with cute muscular mascot "ตุ๊ต๊ะ" theme, add group system (create/join with 6-digit code), scope debts/transactions to groups, fix PromptPay QR, and add LINE bot reset command.

**Deliverables**:
- New database schema with Group/GroupMember models
- Group management API and UI
- Group-scoped debts and transactions
- Fixed PromptPay QR generation + pay functionality
- LINE bot "มะม่วงสีเขียวกินนกสีขาว" reset command
- Complete UI redesign with mascot color palette

**Estimated Effort**: Large
**Parallel Execution**: YES

---

## Context

### Original Request
- Redesign app to match mascot image (cute muscular white character with green sprout)
- Add group system: create/join with 6-digit code, multiple groups per user
- Scope debt collection (ทวงหนี้) and money requests (ขอเงิน) to group members only
- Fix PromptPay QR 400 error
- Add ability to create PromptPay QR for receiving payments
- LINE bot command "มะม่วงสีเขียวกินนกสีขาว" to delete all data

### Mascot Color Palette
- **Primary**: White (#FFFFFF) - face/body
- **Secondary**: Green (#7CB342) - sprout
- **Accent**: Pink (#F48FB1) - cheeks, heart badge
- **Dark**: Black (#212121) - shirt, text
- **Background**: Cream (#FFF8E1), Warm (#FFECB3)
- **Gold**: #FFD700 - coins/money

---

## Work Objectives

### Core Objective
Transform PromKep-Tutra into a group-based finance tracker with cute mascot branding.

### Must Have
1. Group system with create/join/leave
2. 6-digit unique join codes
3. Group-scoped debts and transactions
4. Working PromptPay QR generation
5. Mascot-themed UI redesign
6. LINE bot reset command

### Must NOT Have
- No real-time chat within groups
- No expense splitting (keep simple debt tracking)
- No bank integration beyond PromptPay

---

## Execution Strategy

### Wave 1: Database & API Foundation
- Task 1: Prisma schema migration (Group, GroupMember)
- Task 2: Group API routes (CRUD + join)
- Task 3: Update Transaction/Debt models with groupId
- Task 4: Fix PromptPay QR generation
- Task 5: LINE bot reset command

### Wave 2: Web UI Redesign
- Task 6: Update global theme (colors, fonts, components)
- Task 7: Create group pages (list, create, join, detail)
- Task 8: Update dashboard with group context
- Task 9: Update transaction/debt forms with group selector
- Task 10: Add mascot animations

### Wave 3: Integration & Polish
- Task 11: Update LINE bot webhook for groups
- Task 12: Test all flows end-to-end
- Task 13: Deploy to production

---

## TODOs

- [x] 1. Database Schema Migration

  **What to do**:
  - Add `Group` model with id, name, code (6-digit unique), createdById
  - Add `GroupMember` model with id, groupId, userId, role (admin/member)
  - Add `groupId` optional relation to Transaction and DebtRequest
  - Generate and run Prisma migration
  - Update seed data if needed

  **References**:
  - `api/prisma/schema.prisma` - Current schema
  - Prisma docs for relations

  **QA Scenarios**:
  - Migration runs successfully: `npx prisma migrate dev`
  - New tables appear in database
  - Foreign keys work correctly

- [x] 2. Group API Routes

  **What to do**:
  - POST /groups - Create group, generate 6-digit code
  - GET /groups - List groups for current user
  - POST /groups/join - Join with 6-digit code
  - GET /groups/:id - Get group details
  - GET /groups/:id/members - List members
  - DELETE /groups/:id/leave - Leave group
  - DELETE /groups/:id - Delete group (admin only)

  **References**:
  - `api/src/routes/` - Existing route patterns
  - `api/src/lib/auth.ts` - Auth middleware

- [x] 3. Update Transaction/Debt APIs

  **What to do**:
  - Add groupId to transaction create/list
  - Add groupId to debt create/list
  - Filter by group when groupId provided
  - Default to personal (no group) when not specified

- [x] 4. Fix PromptPay QR

  **What to do**:
  - Check current PromptPay implementation
  - Validate PromptPay ID format
  - Use correct Tag 30 specification
  - Add error handling for invalid IDs
  - Test with real PromptPay ID

  **References**:
  - `api/src/routes/me.ts` - Current PromptPay endpoint
  - PromptPay QR specification (Tag 30)

- [x] 5. LINE Bot Reset Command

  **What to do**:
  - Add webhook handler for "มะม่วงสีเขียวกินนกสีขาว"
  - Delete all database data
  - Send confirmation message with mascot
  - Log the reset action

- [x] 6. UI Theme Update

  **What to do**:
  - Update Tailwind config with mascot colors
  - Update global CSS variables
  - Create mascot avatar component
  - Update button styles (pink with black text)
  - Update card styles (rounded, cream background)

- [x] 7. Group Pages

  **What to do**:
  - /groups - List user's groups
  - /groups/new - Create group form
  - /groups/join - Join with code form
  - /groups/:id - Group detail, members, transactions

- [x] 8. Update Dashboard

  **What to do**:
  - Add group selector/context
  - Show group transactions
  - Show group debts
  - Update quick actions for groups

- [x] 9. Mascot Animations

  **What to do**:
  - Loading animation with bouncing mascot
  - Success animation (confetti + mascot)
  - Debt reminder animation (club swing)
  - Transaction animation (coin drop)

- [ ] 10. Deploy

  **What to do**:
  - Build and test locally
  - Push tag for CI/CD
  - Deploy to droplet
  - Test on mobile

---

## Final Verification Wave

- [ ] F1. Test group creation and joining
- [ ] F2. Test group-scoped transactions
- [ ] F3. Test group-scoped debts
- [ ] F4. Test PromptPay QR generation
- [ ] F5. Test LINE bot reset command
- [ ] F6. Test mobile UI

---

## Success Criteria

- [ ] User can create group and get 6-digit code
- [ ] User can join group with code
- [ ] Debts/transactions scoped to groups
- [ ] PromptPay QR generates without 400 error
- [ ] LINE bot reset command works
- [ ] Mobile UI looks good with mascot theme
