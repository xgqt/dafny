// Copyright by the contributors to the Dafny Project
// SPDX-License-Identifier: MIT

using static Microsoft.Dafny.ErrorRegistry;

namespace Microsoft.Dafny;

public class ResolutionErrors {

  public enum ErrorId {
    // ReSharper disable once InconsistentNaming
    none,
    r_ghost_var_only_in_specifications,
    r_only_in_specification,
    r_ghost_parameters_only_in_specification,
    r_used_only_in_specification,
    r_ghost_destructor_update_not_compilable,
    r_ghost_call_only_in_specification,
    r_ghost_call_only_in_specification_function_4,
    r_ghost_call_only_in_specification_function_3,
    r_ghost_constructors_only_in_ghost_context,
    r_old_expressions_only_in_ghost_context,
    r_type_test_not_runtime_checkable,
    r_fresh_expressions_only_in_ghost_context,
    r_unchanged_expressions_only_in_ghost_context,
    r_rank_expressions_only_in_ghost_context,
    r_prefix_equalities_only_in_ghost_context,
    r_unknown_bounds,
    r_match_not_compilable,
    r_newtype_base_undetermined,
    r_subset_type_base_undetermined,
    r_shared_destructors_have_different_types,
    r_literal_too_large_for_bitvector,
    r_no_unary_minus_in_case_patterns,
    r_type_parameter_undetermined,
    r_bound_variable_undetermined,
    r_bound_variable_may_not_be_ORDINAL,
    r_exists_quantifier_warning,
    r_type_parameter_not_determined,
    r_type_parameter_may_not_be_ORDINAL,
    r_function_type_parameter_undetermined,
    r_function_type_parameter_may_not_be_ORDINAL,
    r_bound_variable_type_undetermined,
    r_never_succeeding_type_cast,
    r_never_succeeding_type_test,
    r_unsupported_type_test,
    r_trivial_null_test,
    r_trivial_null_inclusion_test,
    r_trivial_map_null_inclusion_test,
    r_var_type_undetermined,
    r_no_ORDINAL_as_type_parameter,
    r_abstemious_needs_conconstructor,
    r_bad_astemious_destructor,
    r_bad_astemious_nested_match,
    r_bad_astemious_match,
    r_bad_astemious_codatatype_equality,
    r_expect_statement_is_not_ghost,
    r_print_statement_is_not_ghost,
    r_ghost_break,
    r_produce_statement_not_allowed_in_ghost,
    r_no_assign_to_var_in_ghost,
    r_no_assign_ghost_to_var,
    r_assumption_var_must_be_bool,
    r_assumption_var_must_be_ghost,
    r_assumption_var_must_be_in_method,
    r_no_calls_in_proof,
    r_only_ghost_calls,
    r_out_parameter_must_be_ghost,
    r_out_parameter_must_be_ghost_field,
    r_loop_may_not_use_modifies,
    r_decreases_forbidden_on_ghost_loops,
    r_loop_in_proof_may_not_use_modifies,
    r_ghost_loop_must_terminate,
    r_no_aggregate_heap_update_in_proof,
    r_unknown_bounds_for_forall,
    r_modify_forbidden_in_proof,
    r_new_forbidden_in_proof,
    r_no_heap_update_in_proof,
    r_assignment_forbidden_in_context,
    r_assignment_to_ghost_constructor_only_in_ghost,
    r_assert_only_assumes_others,
    r_assert_only_before_after,
    r_failure_methods_deprecated,
    r_member_only_assumes_other,
    r_member_only_has_no_before_after,
    r_only_one_invariant,
    r_invariants_only_on_predicates,
    r_invariants_only_on_predicates_inside_classes
  }

  static ResolutionErrors() {
    Add(ErrorId.r_assert_only_assumes_others,
    @"
When annotating an assertion with the `{:only}` attribute, all other implicit and explicit assertions
are transformed into assumptions. This is a way to focus on an assertion and its proof, but this annotation has to be removed once finished.
This warning is a reminder about it.", Remove(true, "Finish focusing and remove {:only}"));
    Add(ErrorId.r_assert_only_before_after,
      @"
The `{:only}` attribute accepts an optional argument ""after"" or ""before"" to indicate that the assertions afterwards
(respectively before) should be transformed into assumptions.", Replace(@"""before""", "Replace with \"before\""));
    Add(ErrorId.r_member_only_assumes_other,
      @"
When annotating a member with the `{:only}` attribute, all other members of any declaration in the same file are not verified.
This is a good way to focus on a method, a function or a lemma and its proof, but this annotation has to be removed once finished.
This warning is a reminder about it.", Remove(true, "Finish focusing and remove {:only}"));
    Add(ErrorId.r_member_only_has_no_before_after,
        @"
The `{:only}` attribute on members does not accept optional argument like ""after"" or ""before"" like the `{:only}` attribute on assertions can.",
        Remove(true, "Remove this unused argument"));
    Add(ErrorId.r_only_one_invariant,
      @"
A class cannot have two invariants. Either remove the second invariant attribute,
or create one predicate that calles the two predicates and only mark that predicate with `{:invariant}`",
      Remove(true, "Remove this {:invariant} attribute"));
    Add(ErrorId.r_invariants_only_on_predicates,
      @"
Only a predicate can be annotated with the attribute {:invariant}, because they need to return a truth value.
Functions can't to be annotated with {:invariant}, even if they return a boolean.",
      Remove(true, "Remove this {:invariant} attribute"));
    Add(ErrorId.r_invariants_only_on_predicates_inside_classes,
      @"
Invariant predicates make sense only in the context of a class.
Please move your predicate inside a class for it to be useful.",
      Remove(true, "Remove this {:invariant} attribute"));
  }
}
